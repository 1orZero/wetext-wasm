import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createNormalizer } from '../dist/index.js';

const root = new URL('fixtures/qa-core/', import.meta.url);
const records = JSON.parse(await readFile(new URL('calls.json', root), 'utf8'));
assert.ok(records.length > 0, 'Core Python reference fixtures must not be empty');
const groups = Map.groupBy(records, entry => entry.model);
for (const [model, entries] of groups) {
  test(`Python runtime parity: ${model}`, async () => {
    const normalizer = await createNormalizer({ model: new URL(`${model}/`, root) });
    try {
      for (const entry of entries) {
        assert.deepEqual(normalizer[entry.method](entry.input, entry.options), entry.expected,
          `${entry.method}(${JSON.stringify(entry.input)}, ${JSON.stringify(entry.options)})`);
      }
    } finally { normalizer.dispose(); }
  });
}
