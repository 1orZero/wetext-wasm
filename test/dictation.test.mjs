import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { createNormalizer, UPSTREAM_REVISION } from '../dist/index.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/qa-zh-dictation.json', import.meta.url), 'utf8'));
const normalizers = new Map();
const root = new URL('../', import.meta.url);
function compile(options, name) {
  const model = new URL(`.test-data/qa-zh-options/${name}/`, root);
  const result = spawnSync(process.execPath, ['scripts/python.mjs', 'scripts/export_models.py',
    '--options', JSON.stringify(options), '--output', fileURLToPath(model)], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return model;
}
before(async () => {
  assert.equal(fixture.upstreamRevision, UPSTREAM_REVISION);
  normalizers.set('zh', await createNormalizer());
  normalizers.set('en', await createNormalizer({ language: 'en', direction: 'itn' }));
  normalizers.set('dictation', await createNormalizer({ model: compile({ dictation: true }, 'dictation') }));
});
after(() => { for (const normalizer of normalizers.values()) normalizer.dispose(); });

for (const entry of fixture.cases) {
  test(`default ${entry.language} ITN retains upstream output: ${entry.input}`, () => {
    assert.equal(normalizers.get(entry.language).normalize(entry.input), entry.upstream);
  });
  if (entry.dictation !== undefined) {
    test(`Chinese dictation: ${entry.input}`, () => {
      const normalizer = normalizers.get('dictation');
      assert.equal(normalizer.normalize(entry.input), entry.dictation);
      assert.equal(normalizer.verbalize(normalizer.tag(entry.input)), entry.dictation);
    });
  }
}

for (const [input, expected] of [
  ['二〇二四', '2024'],
  ['三塊五毛', '3塊5毛'],
  ['三块五毛', '3块5毛'],
  ['三十小時', '30小時'],
  ['三十毫秒', '30毫秒'],
  ['三十個選擇', '30個選擇'],
  ['三十千米每小時', '30千米每小時'],
  ['三十公里', '30公里'],
  ['二零二六年十一月四號', '2026年11月4號'],
  ['一月一日', '1月1日'],
  ['廿七日', '27日'],
  ['卅一號', '31號'],
  ['兩點半', '2:30'],
  ['兩點五', '2.5'],
  ['三月', '三月'],
  ['三萬五千臺車', '35000臺車'],
  ['請保留軟體與網路的字形', '請保留軟體與網路的字形'],
  ['零三四 八五四六', '034 8546'],
  ['ABC 零三四八五四六 XYZ', 'ABC 0348546 XYZ'],
]) {
  test(`dictation preserves source text outside converted numbers: ${input}`, () => {
    assert.equal(normalizers.get('dictation').normalize(input), expected);
  });
}

test('dictation retains raw fields and code-point mappings through aliases', () => {
  const n = normalizers.get('dictation');
  const input = '😀廿七，兩萬三！';
  const result = n.normalizeWithMapping(input);
  assert.equal(result.output, '😀27，23000！');
  assert.deepEqual(result.mappings, [
    { kind: 'replace', tokenType: 'cardinal', input: { start: 1, end: 3, text: '廿七' }, output: { start: 1, end: 3, text: '27' } },
    { kind: 'replace', tokenType: 'cardinal', input: { start: 4, end: 7, text: '兩萬三' }, output: { start: 4, end: 9, text: '23000' } },
  ]);
  assert.match(n.tag(input), /value: "廿七"/);
  assert.match(n.tag(input), /value: "兩萬三"/);
});

test('dictation never groups contiguous spoken digits with inserted spaces, including alternatives', () => {
  const n = normalizers.get('dictation');
  for (const input of ['零三四八五四六', '零一二三四五', '零一二三四五六七八九一二']) {
    const outputs = n.normalize(input, { nbest: 30 });
    assert.equal(outputs[0], Array.from(input, character => '零一二三四五六七八九'.indexOf(character)).join(''));
    assert.ok(outputs.every(output => !output.includes(' ')), JSON.stringify(outputs));
  }
});

test('dictation composes with the upstream Chinese ITN build options', async () => {
  for (const [name, options, cases] of [
    ['upstream-flags', { dictation: true, enable_0_to_9: true, enable_million: true, remove_interjections: false },
      [['三', '3'], ['三個', '3個'], ['一千萬', '10000000'], ['啊兩萬三', '啊23000']]],
    ['no-standalone', { dictation: true, enable_standalone_number: false },
      [['二十三', '二十三'], ['三十秒', '30秒'], ['零三四八五四六', '0348546']]],
  ]) {
    const model = compile(options, name);
    const manifest = JSON.parse(await readFile(new URL('manifest.json', model), 'utf8'));
    for (const [key, value] of Object.entries(options)) assert.equal(manifest.options[key], value);
    const normalizer = await createNormalizer({ model });
    try {
      for (const [input, expected] of cases) assert.equal(normalizer.normalize(input), expected, `${name}: ${input}`);
    } finally { normalizer.dispose(); }
  }
  assert.equal(normalizers.get('dictation').normalize('啊兩萬三'), '23000');
});

test('dictation rejects unsupported settings and protects bundled models', () => {
  for (const [args, message] of [
    [['--options', '{"dictation":true}'], /requires --output/],
    [['--options', '{"dictation":true}', '--output', 'models/zh-itn'], /requires --output/],
    [['--language', 'en', '--options', '{"dictation":true}'], /unknown options/],
    [['--direction', 'tn', '--options', '{"dictation":true}'], /unknown options/],
    [['--options', '{"dictation":"true"}'], /boolean values/],
    [['--all', '--options', '{"dictation":true}'], /cannot be combined/],
  ]) {
    const result = spawnSync(process.execPath, ['scripts/python.mjs', 'scripts/export_models.py', ...args],
      { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, message);
  }
});
