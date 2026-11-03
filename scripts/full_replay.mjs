import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { createNormalizer } from '../dist/index.js';
import { compareEvent } from './compare_event.mjs';

const root = new URL('../.test-data/qa-full-reference/', import.meta.url);
const output = new URL('../qa-full-coverage/', root);
await mkdir(output, { recursive: true });
const reference = JSON.parse(await readFile(new URL('summary.json', root)));
const collected = JSON.parse(await readFile(new URL('collected.json', root)));
assert.equal(reference.exitstatus, 0);
assert.equal(reference.collected, 27178);
assert.equal(collected.length, reference.collected);
assert.equal(new Set(collected).size, collected.length);

const results = new Map(collected.map(nodeid => [nodeid, { nodeid, python: {}, calls: 0, replayed: 0, failures: [] }]));
let normalizer, currentModel, calls = 0, errors = 0, replayed = 0, bundled = 0;
const models = new Set();
const failures = [];
try {
  const lines = createInterface({ input: createReadStream(new URL('events.jsonl', root)), crlfDelay: Infinity });
  for await (const line of lines) {
    const event = JSON.parse(line);
    const row = results.get(event.nodeid);
    assert.ok(row, `Uncollected nodeid: ${event.nodeid}`);
    if (event.kind === 'result') {
      assert.equal(row.python[event.phase], undefined, `Duplicate ${event.phase}: ${event.nodeid}`);
      row.python[event.phase] = event.outcome;
      continue;
    }
    assert.equal(event.kind, 'processor');
    row.calls++;
    if (event.error) errors++; else calls++;
    if (!event.model) {
      row.failures.push('缺少可匯出的模型');
      continue;
    }
    if (event.model !== currentModel) {
      normalizer?.dispose();
      normalizer = undefined;
      const referenceUrl = new URL(`models/${event.model}/`, root);
      const manifest = JSON.parse(await readFile(new URL('manifest.json', referenceUrl)));
      const bundledUrl = new URL(`../models/${manifest.language}-${manifest.direction}/`, import.meta.url);
      let modelUrl = referenceUrl;
      try {
        const bundledManifest = JSON.parse(await readFile(new URL('manifest.json', bundledUrl)));
        if (isDeepStrictEqual(manifest.options, bundledManifest.options) && isDeepStrictEqual(manifest.tokenOrders, bundledManifest.tokenOrders)) {
          modelUrl = bundledUrl;
          bundled++;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      try {
        if (modelUrl === referenceUrl && !['tn', 'itn'].includes(manifest.direction)) {
          const direction = manifest.direction.endsWith('itn') ? 'itn' : 'tn';
          const normalizedManifest = { ...manifest, direction };
          const [tagger, verbalizer] = await Promise.all([
            readFile(new URL('tagger.fst', referenceUrl)),
            readFile(new URL('verbalizer.fst', referenceUrl)),
          ]);
          normalizer = await createNormalizer({ model: { manifest: normalizedManifest, tagger, verbalizer } });
        } else {
          normalizer = await createNormalizer({ model: modelUrl });
        }
      } catch (error) {
        failures.push({ nodeid: event.nodeid, model: event.model, reason: `模型載入失敗：${error}` });
      }
      currentModel = event.model;
      models.add(currentModel);
    }
    if (!normalizer) {
      row.failures.push('模型載入失敗');
      continue;
    }
    try {
      compareEvent(normalizer, event);
      row.replayed++;
      replayed++;
    } catch (error) {
      row.failures.push(`${event.method}: ${error.message}`);
      if (failures.length < 500) failures.push({ nodeid: event.nodeid, method: event.method, input: event.input, expected: event.error ?? event.expected, actual: error.actual, reason: String(error) });
    }
  }
} finally {
  normalizer?.dispose();
}
assert.equal(calls, reference.calls);
assert.equal(errors, reference.errors);
assert.deepEqual([...models].sort(), reference.models);
for (const row of results.values()) {
  assert.deepEqual(row.python, { setup: 'passed', call: 'passed', teardown: 'passed' }, row.nodeid);
}
const summary = { collected: collected.length, pythonPassed: results.size, calls, errors, replayed, failedCalls: calls + errors - replayed, models: models.size, bundledModelLoads: bundled, nodeidsWithCalls: [...results.values()].filter(row => row.calls).length, nodeidsWithReplayFailures: [...results.values()].filter(row => row.failures.length).length };
await writeFile(new URL('processor-results.json', output), JSON.stringify([...results.values()], null, 2) + '\n');
await writeFile(new URL('processor-failures.json', output), JSON.stringify(failures, null, 2) + '\n');
await writeFile(new URL('summary.json', output), JSON.stringify(summary, null, 2) + '\n');
console.log(summary);
assert.equal(summary.failedCalls, 0, 'JavaScript behavior differs; see processor-failures.json');
