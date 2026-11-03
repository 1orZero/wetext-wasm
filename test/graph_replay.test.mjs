import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import createModule from '../dist/wasm.js';
import { replayGraphEvent } from '../scripts/graph_runtime.mjs';

test('corrupted independent graph expectation fails replay', async () => {
  const root = new URL('fixtures/qa-core/', import.meta.url);
  const events = JSON.parse(await readFile(new URL('calls.json', root)));
  const reference = events.find(item => item.method === 'tag' && typeof item.expected === 'string');
  assert.ok(reference);
  const event = { kind: 'graph', operation: 'one_top_rewrite', graph: 'negative-control',
    input: reference.input, nbest: 1, expected: reference.expected };
  const module = await createModule();
  const bytes = await readFile(new URL(`${reference.model}/tagger.fst`, root));
  assert.equal(replayGraphEvent(module, event, bytes).pass, true);
  assert.equal(replayGraphEvent(module, { ...event, expected: `${event.expected}qa-corrupt` }, bytes).pass, false);
});
