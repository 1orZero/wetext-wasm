import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createNormalizer, loadModel, TokenParseError } from '../dist/index.js';

const modelUrl = new URL('../models/zh-itn/', import.meta.url);
let normalizer;
before(async () => { normalizer = await createNormalizer(); });
after(() => normalizer?.dispose());

test('normalization preserves literal bracket, quote, backslash, and Unicode characters', () => {
  const input = '😀 [abc] "abc" \\ abc';
  assert.equal(normalizer.normalize(input), input);
  assert.equal(normalizer.verbalize(normalizer.tag(input)), input);
});

test('empty input has a consistent shape across single and multiple candidate APIs', () => {
  const mapped = { input: '', output: '', mappings: [] };
  for (const method of ['normalize', 'tag', 'verbalize']) assert.equal(normalizer[method](''), '');
  assert.deepEqual(normalizer.normalize('', { nbest: 3 }), ['']);
  assert.deepEqual(normalizer.tag('', { nbest: 3 }), ['']);
  assert.deepEqual(normalizer.normalizeWithMapping(''), mapped);
  assert.deepEqual(normalizer.normalizeWithMapping('', { nbest: 3 }), [mapped]);
});

test('invalid input and candidate counts fail before entering native operations', () => {
  for (const method of ['normalize', 'tag', 'normalizeWithMapping']) {
    for (const nbest of [0, -1, 1.5, NaN, Infinity, true, '2', 2147483648]) {
      assert.throws(() => normalizer[method]('二十三', { nbest }), RangeError);
    }
    for (const input of [null, undefined, 123, '\ud800', 'a\udfff']) {
      assert.throws(() => normalizer[method](input), TypeError);
    }
  }
  assert.throws(() => normalizer.normalizeWithMapping('二十三', { includeIdentity: 1 }), TypeError);
  assert.equal(normalizer.normalize('二十三'), '23');
});

test('malformed tokens and valid tokens without a path throw recoverable errors', () => {
  for (const input of ['cardinal { value: "23"', 'cardinal { value: "a" value: "b" }', 'cardinal { value: "a\\']) {
    assert.throws(() => normalizer.verbalize(input), TokenParseError);
  }
  for (let i = 0; i < 10; i++) {
    assert.throws(() => normalizer.verbalize('qa_unknown { value: "x" }'), /no WFST path/);
  }
  assert.equal(normalizer.normalize('二十三'), '23');
});

test('models reject incompatible metadata, corrupt bytes, and invalid native graphs', async () => {
  const original = await loadModel(modelUrl);
  const corrupt = { ...original, tagger: original.tagger.slice() };
  corrupt.tagger[corrupt.tagger.length - 1] ^= 1;
  await assert.rejects(createNormalizer({ model: corrupt }), /checksum/);
  await assert.rejects(createNormalizer({ model: { ...original, verbalizer: new Uint8Array() } }), /size/);
  await assert.rejects(createNormalizer({ model: { ...original, manifest: { ...original.manifest, upstream: 'wrong' } } }), /manifest/);
  await assert.rejects(createNormalizer({ model: original, direction: 'tn' }), /does not match/);
  await assert.rejects(createNormalizer({ language: '../zh' }), TypeError);
  const bytes = new TextEncoder().encode('qa-invalid-fst');
  const invalid = {
    ...original,
    tagger: bytes,
    manifest: {
      ...original.manifest,
      files: { ...original.manifest.files, 'tagger.fst': { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } },
    },
  };
  await assert.rejects(createNormalizer({ model: invalid }), /Invalid OpenFst model/);
  assert.equal(normalizer.normalize('二十三'), '23');
});

test('disposing one normalizer does not invalidate another or the shared runtime', async () => {
  for (let i = 0; i < 3; i++) {
    const other = await createNormalizer();
    assert.equal(other.normalize('二十三'), '23');
    other.dispose();
    other.dispose();
    for (const method of ['normalize', 'tag', 'verbalize', 'normalizeWithMapping']) {
      assert.throws(() => other[method](''), /disposed/);
    }
    assert.equal(normalizer.normalize('二十三'), '23');
  }
});

test('an explicit WASM binary and verified model bytes work without filesystem loading', async () => {
  const model = await loadModel(modelUrl);
  const wasmBinary = new Uint8Array(await readFile(new URL('../dist/wetext.wasm', import.meta.url)));
  const other = await createNormalizer({ model, runtime: { wasmBinary } });
  try { assert.equal(other.normalize('百分之三十'), '30%'); } finally { other.dispose(); }
});

test('HTTP model loading checks responses and supports a directory URL without a slash', async () => {
  const server = createServer(async (request, response) => {
    const name = request.url?.split('/').at(-1);
    if (!request.url?.startsWith('/qa-model/') || !['manifest.json', 'tagger.fst', 'verbalizer.fst'].includes(name)) {
      response.writeHead(404).end();
      return;
    }
    try { response.end(await readFile(new URL(name, modelUrl))); }
    catch { response.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  try {
    const model = await loadModel(`${address}/qa-model`);
    assert.deepEqual(model.manifest, (await loadModel(modelUrl)).manifest);
    const other = await createNormalizer({ model });
    try { assert.equal(other.normalize('二十三'), '23'); } finally { other.dispose(); }
    await assert.rejects(loadModel(`${address}/qa-missing?bad=1`), /HTTP 404/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
