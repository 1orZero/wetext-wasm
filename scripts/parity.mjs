import assert from 'node:assert/strict';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { createNormalizer } from '../dist/index.js';

const root = new URL('../.test-data/qa-reference/', import.meta.url);
const reference = JSON.parse(await readFile(new URL('summary.json', root), 'utf8'));
assert.equal(reference.exitstatus, 0, 'The upstream reference suite must pass first');
assert.ok(reference.calls > 0, 'The reference suite did not record any API calls');
const failures = createWriteStream(new URL('../qa-parity-failures.jsonl', root));
let normalizer;
let modelId;
let checked = 0;
let failed = 0;
const methods = {};
const models = new Set();
const bundledModels = new Set();
const started = performance.now();
try {
  const lines = createInterface({ input: createReadStream(new URL('calls.jsonl', root)), crlfDelay: Infinity });
  for await (const line of lines) {
    const entry = JSON.parse(line);
    if (modelId !== entry.model) {
      normalizer?.dispose();
      const referenceUrl = new URL(`models/${entry.model}/`, root);
      const manifest = JSON.parse(await readFile(new URL('manifest.json', referenceUrl), 'utf8'));
      const bundledUrl = new URL(`../models/${manifest.language}-${manifest.direction}/`, import.meta.url);
      const bundledManifest = JSON.parse(await readFile(new URL('manifest.json', bundledUrl), 'utf8'));
      const useBundled = isDeepStrictEqual(manifest.options, bundledManifest.options);
      normalizer = await createNormalizer({ model: useBundled ? bundledUrl : referenceUrl });
      if (useBundled) bundledModels.add(`${manifest.language}-${manifest.direction}`);
      modelId = entry.model;
      models.add(modelId);
    }
    try {
      assert.ok(['normalize', 'normalizeWithMapping', 'tag', 'verbalize'].includes(entry.method));
      const actual = normalizer[entry.method](entry.input, entry.options);
      assert.deepEqual(actual, entry.expected);
    } catch (error) {
      failed++;
      failures.write(JSON.stringify({ ...entry, error: String(error), actual: error.actual }) + '\n');
      if (failed <= 10) console.error(`${entry.method}(${JSON.stringify(entry.input)}): ${error.message}`);
    }
    checked++;
    methods[entry.method] = (methods[entry.method] ?? 0) + 1;
    if (checked % 1000 === 0) console.log(`Replayed ${checked}/${reference.calls} Python calls; ${failed} failures`);
  }
} finally {
  normalizer?.dispose();
  await new Promise((resolve, reject) => {
    failures.on('error', reject);
    failures.end(resolve);
  });
}
assert.equal(checked, reference.calls, 'Reference record count does not match its summary');
assert.deepEqual([...models].sort(), [...reference.models].sort(), 'Not all reference models were replayed');
const summary = { checked, failed, models: models.size, bundledModels: bundledModels.size, methods, seconds: (performance.now() - started) / 1000 };
await writeFile(new URL('../qa-parity-summary.json', root), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
assert.equal(failed, 0, 'JavaScript output differs from Python; see .test-data/qa-parity-failures.jsonl');
