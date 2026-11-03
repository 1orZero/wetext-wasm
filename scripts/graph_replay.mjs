import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import createModule from '../dist/wasm.js';
import { replayGraphEvent } from './graph_runtime.mjs';

const root = new URL('../.test-data/qa-graph-reference/', import.meta.url);
const out = new URL('../.test-data/qa-graph-coverage/', import.meta.url);
await mkdir(out, { recursive: true });
assert.equal(JSON.parse(await readFile(new URL('summary.json', root))).exitstatus, 0);
const unresolved = JSON.parse(await readFile(new URL('../qa-full-coverage/processor-unresolved.json', root)));
const assigned = unresolved.filter(row => /^(tn|itn)\/german\/test\/|^tn\/korean\/test\/|^tn\/chinese\/test\/cardinal_test\.py/.test(row.nodeid));
const rows = new Map(assigned.map(row => [row.nodeid, { nodeid: row.nodeid, status: 'unresolved', assertions: [], rationale: '', evidence: [] }]));
const events = (await readFile(new URL('events.jsonl', root), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const module = await createModule();
const failures = [];
let passed = 0;
for (const [index, event] of events.entries()) {
  const row = rows.get(event.nodeid);
  if (!row) continue;
  const bytes = event.graph ? await readFile(new URL(`graphs/${event.graph}.fst`, root)) : undefined;
  try {
    const result = replayGraphEvent(module, event, bytes);
    row.assertions.push({ kind: event.kind, operation: event.operation, input: event.input ?? event.tagged, pass: result.pass });
    row.evidence.push(`events.jsonl:${index + 1}`);
    if (result.pass) passed++;
    else failures.push({ nodeid: event.nodeid, index, input: event.input, expected: event.expected, actual: result.actual });
  } catch (error) {
    failures.push({ nodeid: event.nodeid, index, input: event.input, expected: event.expected, error: String(error) });
  }
}
for (const row of rows.values()) {
  row.status = row.assertions.length && row.assertions.every(item => item.pass) ? 'js-extra-pass' : 'unresolved';
  row.rationale = row.status === 'js-extra-pass' ? '直接圖與 token 查詢已由 WASM／JavaScript 重播；完整結果相等保留原測試對值、集合與位置的斷言。Python 建圖等價及 schema 常數另見 retained coverage。' : '仍缺直接 JavaScript/WASM 查詢或有差異。';
}
await writeFile(new URL('coverage.json', out), JSON.stringify([...rows.values()], null, 2) + '\n');
await writeFile(new URL('failures.json', out), JSON.stringify(failures, null, 2) + '\n');
console.log(JSON.stringify({ assigned: rows.size, events: events.length, passed, failures: failures.length,
  jsExtraPass: [...rows.values()].filter(row => row.status === 'js-extra-pass').length }));
assert.equal(failures.length, 0);
