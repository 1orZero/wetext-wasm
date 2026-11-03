import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createNormalizer } from '../dist/index.js';
import { parseTokens } from '../dist/tokens.js';
import createWasm from '../dist/wasm.js';
import { replayCoreEvent } from './core_runtime.mjs';

const root = new URL('../.test-data/', import.meta.url);
const reference = new URL('qa-full-reference/', root);
const out = new URL('qa-core-coverage/', root);
await mkdir(out, { recursive: true });
const assigned = [
  'tn/chinese/test/processor_test.py',
  'tn/chinese/test/alignment_test.py',
  'tn/chinese/test/token_parser_test.py',
  'tn/test/robustness_test.py',
  'tn/test/punctuation_spacing_test.py',
];
const unresolved = JSON.parse(await readFile(new URL('qa-full-coverage/processor-unresolved.json', root)));
const rows = new Map(unresolved.filter(row => assigned.some(file => row.nodeid.startsWith(file + '::'))).map(row => [row.nodeid, {
  nodeid: row.nodeid, status: 'unresolved', assertions: [], rationale: '尚無逐斷言 JS/WASM 證據。', evidence: [],
}]));
assert.equal(rows.size, 506);
const mark = (id, status, assertions, rationale, evidence) => {
  const row = rows.get(id);
  assert.ok(row, id);
  Object.assign(row, { status, assertions, rationale, evidence });
};
const parser = JSON.parse(await readFile(new URL('qa-core-reference/parser.json', root)));
for (const event of parser) {
  replayCoreEvent(null, null, { ...event, kind: 'parser' });
  mark(event.nodeid, 'js-extra-pass', ['parser fields/order/escape or malformed rejection'], '由獨立 Python TokenParser 結果比對 JS parser 與 reorder；兩端實際執行。', ['qa-core-reference/parser.json', 'scripts/core_runtime.mjs']);
}
// The four cursor tests describe Python TokenParser's incremental scanner, absent from the JS API.
for (const suffix of ['test_read', 'test_parse_ws', 'test_parse_chars', 'test_parse_key', 'test_parse_value']) {
  const id = `tn/chinese/test/token_parser_test.py::TestTokenParser::${suffix}`;
  mark(id, 'python-build-pass', ['Python incremental parser cursor state'], 'JS parseTokens 只提供完整 token stream 解析；此斷言檢查 Python 私有逐字游標，原 pytest 已通過。', ['qa-full-reference/pytest.log', 'vendor/WeTextProcessing/tn/chinese/test/token_parser_test.py']);
}
const wasm = await createWasm();
const alignment = JSON.parse(await readFile(new URL('qa-core-reference/alignment.json', root)));
for (const event of alignment) {
  const bytes = await readFile(new URL(`qa-core-reference/${event.graph}`, root));
  replayCoreEvent(wasm, bytes, { ...event, kind: 'graph' });
  const helperOnly = event.nodeid.includes('test_transduce_without_spans_skips_tracking_helpers');
  mark(event.nodeid, 'js-extra-pass', helperOnly ? ['WASM output selection', 'Python-only helper call counts'] : ['WASM graph trace', 'alignment spans or no-path error'], helperOnly ? 'Python 私有 _linear_arcs／_text_boundaries 呼叫次數不屬 JS API；原 pytest 驗證沒有呼叫。相同合成圖在 WASM 驗證預設與指定輸出。' : 'Python 原圖寫出 FST；WASM 實際追蹤，再由 JS 推導並比對獨立 Python spans。', [`qa-core-reference/alignment.json#${event.id}`, `qa-core-reference/${event.graph}`, 'scripts/core_runtime.mjs']);
}
const byNode = new Map();
const stream = createInterface({ input: createReadStream(new URL('events.jsonl', reference)), crlfDelay: Infinity });
for await (const line of stream) {
  const event = JSON.parse(line);
  if (event.kind !== 'processor' || !rows.has(event.nodeid)) continue;
  const events = byNode.get(event.nodeid) ?? [];
  events.push(event);
  byNode.set(event.nodeid, events);
}
let currentModel, normalizer;
const failures = [];
try {
  for (const [id, events] of byNode) {
    if (!id.startsWith('tn/test/')) continue;
    for (const event of events) {
      if (event.model !== currentModel) {
        normalizer?.dispose();
        normalizer = undefined;
        const url = new URL(`models/${event.model}/`, reference);
        const manifest = JSON.parse(await readFile(new URL('manifest.json', url)));
        if (['tn', 'itn'].includes(manifest.direction)) normalizer = await createNormalizer({ model: url });
        else normalizer = await createNormalizer({ model: { manifest: { ...manifest, direction: manifest.direction.endsWith('itn') ? 'itn' : 'tn' }, tagger: await readFile(new URL('tagger.fst', url)), verbalizer: await readFile(new URL('verbalizer.fst', url)) } });
        currentModel = event.model;
      }
      const actual = normalizer[event.method](event.input, event.options);
      assert.deepEqual(actual, event.expected, id);
      if (id.includes('test_every_pipeline_returns_output')) {
        if (event.method === 'normalize') assert.ok(actual.trim(), id);
        if (event.method === 'normalizeWithMapping') assert.equal(actual.output, events.find(e => e.method === 'normalize').expected, id);
      } else if (id.includes('test_invalid_numeric_dates')) {
        if (event.method === 'tag') assert.ok(parseTokens(actual).every(token => token.name !== 'date'), id);
      } else if (id.includes('test_numbers_keep_attached_punctuation')) {
        assert.doesNotMatch(actual, / [,.!?;:)\]}]|[(\[{] /, id);
      }
    }
    mark(id, 'js-extra-pass', ['Processor result equality', 'source test predicate'], '完整 Processor 結果與 Python 相等，並在 JS 上重跑原案例的額外斷言。', [`qa-full-reference/events.jsonl#${id}`, 'scripts/core_replay.mjs']);
  }
} catch (error) {
  failures.push(String(error));
} finally { normalizer?.dispose(); }
for (const [id, events] of byNode) {
  if (!id.startsWith('tn/chinese/test/processor_test.py::')) continue;
  if (rows.get(id).status !== 'unresolved') continue;
  const shape = id.split('::').at(-1);
  if (shape.startsWith('test_cache_') || shape.startsWith('test_source_fingerprint') || shape.startsWith('test_default_cache') || shape.startsWith('test_explicit_cache') || shape.startsWith('test_production_fingerprint') || shape.startsWith('test_concurrent_builders') || shape.startsWith('test_failed_publication') || shape.startsWith('test_incomplete_or_corrupt') || shape.startsWith('test_legacy_flat') || shape.startsWith('test_failed_initial')) {
    mark(id, 'python-build-pass', ['Python cache/build publication and filesystem state'], '僅驗證 Python 開發時的 FST 建置、快取及磁碟原子發布；JS 套件載入既有模型，不執行此建置流程。', ['qa-full-reference/pytest.log', 'vendor/WeTextProcessing/tn/cache.py']);
  } else if (events.length && !shape.startsWith('test_nbest_stops_expanding') && !shape.startsWith('test_weighted_field') && !shape.startsWith('test_weighted_stream')) {
    mark(id, 'js-extra-pass', ['Processor complete result equality'], `原斷言為輸出、候選順序或映射內容；完整結果相等蘊含該斷言。記錄 ${events.length} 次呼叫，見來源測試。`, [`qa-full-reference/events.jsonl#${id}`, 'qa-full-coverage/processor-results.json']);
  }
}
for (const [id, row] of rows) {
  if (row.status !== 'unresolved') continue;
  if (/^tn\/chinese\/test\/processor_test\.py::test_(cache_|source_fingerprint|default_cache|explicit_cache|production_fingerprint|failed_initial|rule_inventory)/.test(id)) {
    mark(id, 'python-build-pass', ['Python FST construction, cache, source fingerprint, or rule inventory'], '原測試驗證 Python 建置期的磁碟快取、指紋、原子發布或 RuleSpec；JS 僅載入已編譯模型，沒有此建置 API。', ['qa-full-reference/pytest.log', 'vendor/WeTextProcessing/tn/chinese/test/processor_test.py']);
  } else if (id.includes('test_nbest_stops_expanding_once_enough_outputs_are_selected')) {
    const events = byNode.get(id) ?? [];
    assert.ok(events.length > 0, id);
    mark(id, 'js-extra-pass', ['visible nbest candidate outputs', 'Python shortestpath call counts'], 'Python shortestpath 呼叫序列是其迭代實作細節；JS 改用 WASM lattice.paths。相同案例的輸出與候選順序已在完整 Processor 重播驗證。', [`qa-full-reference/events.jsonl#${id}`, 'qa-full-coverage/processor-results.json', 'vendor/WeTextProcessing/tn/chinese/test/processor_test.py']);
  }
}
const mappingId = 'tn/chinese/test/alignment_test.py::test_mapping_exposes_token_type';
const mappedEvent = [...byNode.values()].flat().find(event => event.method === 'normalizeWithMapping' && event.expected?.mappings?.some(mapping => mapping.tokenType === 'math'));
if (mappedEvent) {
  const mapping = mappedEvent.expected.mappings.find(item => item.tokenType === 'math');
  assert.deepEqual(Object.keys(mapping).sort(), ['input', 'kind', 'output', 'tokenType']);
  assert.deepEqual(Object.keys(mapping.input).sort(), ['end', 'start', 'text']);
  mark(mappingId, 'js-extra-pass', ['mapping object shape and tokenType'], '完整 JS/WASM Processor 映射結果已與 Python 相等；同時核對 math token 的公開資料形狀。', [`qa-full-reference/events.jsonl#${mappedEvent.nodeid}`, 'qa-full-coverage/processor-results.json']);
  rows.get(mappingId).runtimeNodeids = [mappedEvent.nodeid];
}
const schemaId = 'tn/chinese/test/processor_test.py::test_pipeline_owned_token_schema_is_used';
assert.equal((await import('../dist/tokens.js')).reorderTokens(parseTokens('custom { first: "1" second: "2" }'), { custom: ['second', 'first'] }).text, 'custom { second: "2" first: "1" }');
mark(schemaId, 'js-extra-pass', ['pipeline token field order'], 'JS parser 與 reorderTokens 實際執行 Python 案例的自訂欄位順序。', ['scripts/core_replay.mjs']);
for (const [id, reason] of [
  ['test_weighted_field_restores_original_joint_path_costs', 'Python _normalization_candidates 的 tagger_weight 與 weight 是私有中間值；目前僅有候選輸出重播，不能證明兩個內部權重。'],
  ['test_weighted_stream_projects_unique_outputs_before_expanding', 'Python _UniqueOutputPathStream._limit 是私有擴展上限；目前 JS 候選輸出相同，但沒有 2048 重複路徑的獨立 WASM fixture。'],
]) {
  const nodeid = `tn/chinese/test/processor_test.py::${id}`;
  if (rows.get(nodeid).status === 'unresolved') rows.get(nodeid).rationale = reason;
}
const coverage = [...rows.values()];
await writeFile(new URL('coverage.json', out), JSON.stringify(coverage, null, 2) + '\n');
await writeFile(new URL('failures.json', out), JSON.stringify(failures, null, 2) + '\n');
const counts = coverage.reduce((acc, row) => (acc[row.status] = (acc[row.status] ?? 0) + 1, acc), {});
console.log(counts, failures);
assert.equal(failures.length, 0);
