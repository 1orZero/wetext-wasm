import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../.test-data/', import.meta.url);
const inventory = JSON.parse(await readFile(new URL('qa-coverage-audit/inventory.json', root)));
const rows = JSON.parse(await readFile(new URL('qa-full-coverage/processor-results.json', root)));
const byFunction = new Map(inventory.functions.map(item => [`${item.file}::${item.function}`, item]));
const baseOnly = process.argv.includes('--base');
for (const row of rows) {
  const [file, ...rest] = row.nodeid.split('::');
  const functionName = rest.at(-1).replace(/\[.*$/, '');
  const source = byFunction.get(`${file}::${functionName}`);
  assert.ok(source, `Missing static classification: ${row.nodeid}`);
  row.category = source.category;
  row.shapes = source.shapes;
  if (row.failures.length) {
    row.status = 'unresolved-replay-failure';
    row.rationale = row.failures.join('; ');
  } else if (row.calls && row.replayed === row.calls && ['完整pipeline公開API', '個別Processor規則API'].includes(row.category) && !source.shapes.some(shape => ['raw', 'mock', 'structure'].includes(shape))) {
    row.status = 'js-processor-pass';
    row.rationale = '原 pytest 通過；該 nodeid 的所有 Processor 呼叫由 Node/WASM 以獨立 Python 預期值重播通過。';
  } else if (row.calls && row.replayed === row.calls) {
    row.status = 'unresolved-other-assertions';
    row.rationale = 'Processor 呼叫已在 Node/WASM 通過；其他 graph、結構、mock 或間接斷言尚未逐項對應。';
  } else if (row.category === '純build/cache/CLI/grammar結構驗證') {
    row.status = 'unresolved-python-classification';
    row.rationale = '原 pytest 通過；靜態分類屬 Python 建置或工具測試，仍須逐項確認是否有 JS 執行階段承諾。';
  } else {
    row.status = 'unresolved-no-js-evidence';
    row.rationale = '原 pytest 通過；目前沒有此 nodeid 的獨立 JavaScript/WASM 執行證據。';
  }
}
assert.equal(rows.length, 27178);
await writeFile(new URL('qa-full-coverage/processor-unresolved.json', root), JSON.stringify(rows.filter(row => row.status.startsWith('unresolved')), null, 2) + '\n');
if (!baseOnly) {
  const byId = new Map(rows.map(row => [row.nodeid, row]));
  assert.equal(byId.size, rows.length);
  for (const lane of ['scope', 'core', 'graph', 'completion', 'retained']) {
    if (['core', 'graph', 'completion'].includes(lane)) assert.deepEqual(JSON.parse(await readFile(new URL(`qa-${lane}-coverage/failures.json`, root))), [], `${lane} replay failed`);
    const supplement = JSON.parse(await readFile(new URL(`qa-${lane}-coverage/coverage.json`, root)));
    const seen = new Set();
    for (const evidence of supplement) {
      assert.ok(!seen.has(evidence.nodeid), `Duplicate ${lane} coverage: ${evidence.nodeid}`);
      seen.add(evidence.nodeid);
      const row = byId.get(evidence.nodeid);
      assert.ok(row, `Unknown ${lane} test: ${evidence.nodeid}`);
      if (evidence.status === 'unresolved') continue;
      assert.ok(['js-extra-pass', 'python-build-pass'].includes(evidence.status));
      assert.ok(evidence.assertions.length && evidence.evidence.length && evidence.rationale);
      row.supplements ??= [];
      row.supplements.push({ lane, ...evidence });
    }
  }
  for (const row of rows) {
    assert.equal(row.failures.length, 0, row.nodeid);
    assert.equal(row.calls, row.replayed, row.nodeid);
    const runtime = row.calls > 0 || row.supplements?.some(item => item.status === 'js-extra-pass');
    const retained = row.supplements?.some(item => item.status === 'python-build-pass');
    if (row.status === 'js-processor-pass' || row.supplements?.length) {
      row.status = retained ? (runtime ? 'js-runtime-and-python-build-pass' : 'python-build-pass') : 'js-runtime-pass';
      row.rationale = retained ? 'Python 建置／私有實作斷言保留原 pytest；本案例的所有執行行為另有 JS/WASM 證據，詳見 supplements。'
        : '原 pytest 已通過；完整 Processor 結果與需要的 graph、parser、alignment 或權重補充斷言均重播通過。';
    }
  }
}
const counts = {};
for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), rows.length);
await writeFile(new URL('qa-full-coverage/matrix.json', root), JSON.stringify(rows, null, 2) + '\n');
await writeFile(new URL('qa-full-coverage/unresolved.json', root), JSON.stringify(rows.filter(row => row.status.startsWith('unresolved')), null, 2) + '\n');
await writeFile(new URL('qa-full-coverage/matrix-summary.json', root), JSON.stringify({ total: rows.length, counts }, null, 2) + '\n');
console.log({ total: rows.length, counts });
if (!baseOnly) assert.equal(rows.filter(row => row.status.startsWith('unresolved')).length, 0, 'Upstream coverage remains incomplete');
