import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createNormalizer } from '../dist/index.js';
import { compareEvent } from '../scripts/compare_event.mjs';

test('upstream replay detects corrupted independent expectations', async () => {
  const root = new URL('fixtures/qa-core/', import.meta.url);
  const records = JSON.parse(await readFile(new URL('calls.json', root)));
  const event = records.find(record => typeof record.expected === 'string' && record.expected.length);
  assert.ok(event);
  const normalizer = await createNormalizer({ model: new URL(`${event.model}/`, root) });
  try {
    compareEvent(normalizer, event);
    assert.throws(() => compareEvent(normalizer, { ...event, expected: `qa-corrupted-${event.expected}` }), assert.AssertionError);
  } finally {
    normalizer.dispose();
  }
});
