import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.argv[2] ?? "http://127.0.0.1:8794";
const mode = process.argv[3] ?? "full";
assert.ok(["full", "models"].includes(mode));
const index = JSON.parse(await readFile(new URL(".qa-assets/qa-full-parity/index.json", import.meta.url), "utf8"));
const deployedIndex = await fetch(new URL("/qa-full-parity/index.json", base));
assert.equal(deployedIndex.status, 200);
assert.deepEqual(await deployedIndex.json(), index, "The deployed corpus does not match the local reference");
assert.deepEqual(index.models.flatMap(model => model.caseIds).sort((a, b) => a - b), Array.from({ length: index.calls }, (_, id) => id));
const results = [];
const splits = [];
const started = performance.now();

async function replay(model, batch, offset, count) {
  const start = batch * index.batchSize + offset;
  const expectedIds = model.caseIds.slice(start, start + count);
  const url = new URL("/qa-parity", base);
  for (const [key, value] of Object.entries({ model: model.id, batch, offset, limit: count })) url.searchParams.set(key, String(value));
  let result = { model: model.id, language: model.language, direction: model.direction, batch, offset, expected: count, ok: false };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 2000) }; }
    if (response.status === 503 && text.includes("1102") && count > 1) {
      splits.push({ model: model.id, batch, offset, count, ray: response.headers.get("cf-ray") });
      const first = Math.floor(count / 2);
      await replay(model, batch, offset, first);
      await replay(model, batch, offset + first, count - first);
      return;
    }
    result = { ...result, status: response.status, ray: response.headers.get("cf-ray"), ...body };
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.id, model.id);
    assert.equal(body.batch, batch);
    assert.equal(body.offset, offset);
    assert.equal(body.checked, count);
    assert.deepEqual(body.caseIds, expectedIds, "The Worker replayed the wrong reference entries");
    assert.deepEqual(body.failures, []);
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.error = String(error);
  }
  results.push(result);
  if (!result.ok) console.error(JSON.stringify(result));
}

for (const model of [...index.models].sort((a, b) => b.bytes - a.bytes)) {
  const batches = mode === "models" ? 1 : model.batches;
  for (let batch = 0; batch < batches; batch++) {
    const size = mode === "models" ? 1 : Math.min(index.batchSize, model.calls - batch * index.batchSize);
    const limit = mode === "models" ? 1 : model.requestLimit;
    for (let offset = 0; offset < size; offset += limit) await replay(model, batch, offset, Math.min(limit, size - offset));
  }
  const checked = results.filter(result => result.model === model.id && result.ok).reduce((sum, result) => sum + result.checked, 0);
  console.error(`${model.language}-${model.direction} ${model.id.slice(0, 8)}: ${checked}/${mode === "models" ? 1 : model.calls} calls passed`);
}
const passed = results.filter(result => result.ok);
const verifiedIds = passed.flatMap(result => result.caseIds).sort((a, b) => a - b);
const expectedIds = index.models.flatMap(model => mode === "models" ? model.caseIds.slice(0, 1) : model.caseIds).sort((a, b) => a - b);
const summary = { base, mode, referenceSha256: index.referenceSha256, models: index.models.length, batches: results.length,
  expected: mode === "models" ? index.models.length : index.calls,
  checked: verifiedIds.length, expectedErrors: passed.reduce((sum, result) => sum + result.expectedErrors, 0),
  failedBatches: results.filter(result => !result.ok).length,
  seconds: (performance.now() - started) / 1000, splits, results };
console.log(JSON.stringify(summary, null, 2));
assert.equal(summary.failedBatches, 0, "Workers parity failed; inspect the recorded batch results");
assert.equal(summary.checked, summary.expected);
assert.deepEqual(verifiedIds, expectedIds, "Reference entries were skipped, duplicated, or replaced");
if (mode === "full") assert.equal(summary.expectedErrors, index.expectedErrors);
