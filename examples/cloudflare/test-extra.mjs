import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:8794';
const index = JSON.parse(await readFile(new URL('.qa-assets/qa-extra/index.json', import.meta.url)));
const deployed = await fetch(new URL('/qa-extra/index.json', base));
assert.equal(deployed.status, 200);
assert.deepEqual(await deployed.json(), index);
const results = [];
const started = performance.now();
for (const batch of index.batches) {
  let result = { batch: batch.id, ok: false };
  try {
    const response = await fetch(new URL(`/qa-extra?batch=${batch.id}`, base), { signal: AbortSignal.timeout(120000) });
    const body = await response.json();
    result = { ...result, status: response.status, ...body };
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.batch, batch.id);
    assert.deepEqual(body.caseIds, batch.caseIds);
    assert.deepEqual(body.failures, []);
    result.ok = true;
  } catch (error) { result.ok = false; result.error = String(error); }
  results.push(result);
  if (!result.ok) console.error(result);
}
const verified = results.filter(result => result.ok).flatMap(result => result.caseIds).sort((a, b) => a - b);
const summary = { base, referenceSha256: index.referenceSha256, expected: index.events, checked: verified.length,
  failedBatches: results.filter(result => !result.ok).length, seconds: (performance.now() - started) / 1000, results };
console.log(JSON.stringify(summary, null, 2));
assert.equal(summary.failedBatches, 0);
assert.deepEqual(verified, Array.from({ length: index.events }, (_, id) => id));
