import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createNormalizer } from '../dist/index.js';
import createModule from '../dist/wasm.js';
import { replayCompletionEvent } from './completion_runtime.mjs';

const root = new URL('../.test-data/qa-completion-reference/', import.meta.url);
const out = new URL('../.test-data/qa-completion-coverage/', import.meta.url);
await mkdir(out, { recursive: true });
const summary = JSON.parse(await readFile(new URL('summary.json', root)));
assert.equal(summary.exitstatus, 0);
const events = (await readFile(new URL('events.jsonl', root), 'utf8')).trim().split('\n').map(JSON.parse);
assert.equal(events.length, summary.events);
const module = await createModule();
const rows = new Map();
const failures = [];
const controls = new Set();
let normalizer, currentModel;
try {
  for (const [index, event] of events.entries()) {
    assert.equal(event.caseId, index);
    if (event.model && event.model !== currentModel) {
      normalizer?.dispose();
      normalizer = undefined;
      normalizer = await createNormalizer({ model: new URL(`models/${event.model}/`, root) });
      currentModel = event.model;
    }
    const bytes = event.graph ? await readFile(new URL(`graphs/${event.graph}.fst`, root)) : undefined;
    const row = rows.get(event.nodeid) ?? { nodeid: event.nodeid, status: 'js-extra-pass', assertions: [],
      rationale: '直接 parser、候選權重、去重路徑或後處理斷言已由獨立 Python 資料在 JavaScript／WASM 重播。', evidence: [] };
    rows.set(event.nodeid, row);
    try {
      replayCompletionEvent(module, event, bytes, normalizer);
      if (!controls.has(event.kind) && event.expected !== undefined) {
        const invalid = structuredClone(event);
        if (typeof invalid.expected === 'string') invalid.expected += 'qa-invalid';
        else if (event.kind === 'candidates') invalid.expected[0].weight += 1;
        else if (event.kind === 'weighted-paths') invalid.expected[0].weight += 1;
        else if (event.kind === 'tokens') invalid.expected[0].name += 'qa-invalid';
        else invalid.expected = ['qa-invalid'];
        assert.throws(() => replayCompletionEvent(module, invalid, bytes, normalizer), assert.AssertionError);
        controls.add(event.kind);
      }
      row.assertions.push({ kind: event.kind, caseId: index, pass: true });
    } catch (error) {
      row.status = 'unresolved';
      failures.push({ nodeid: event.nodeid, caseId: index, error: String(error) });
    }
    row.evidence.push(`qa-completion-reference/events.jsonl:${index + 1}`);
  }
} finally { normalizer?.dispose(); }
await writeFile(new URL('coverage.json', out), JSON.stringify([...rows.values()], null, 2) + '\n');
await writeFile(new URL('failures.json', out), JSON.stringify(failures, null, 2) + '\n');
const result = { events: events.length, nodeids: rows.size, failures: failures.length, negativeControls: [...controls] };
await writeFile(new URL('summary.json', out), JSON.stringify(result, null, 2) + '\n');
console.log(result, failures.slice(0, 10));
assert.equal(failures.length, 0);
