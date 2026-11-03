import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const reference = new URL("../../.test-data/qa-full-reference/", import.meta.url);
const assets = new URL(".qa-assets/qa-full-parity/", import.meta.url);
const summary = JSON.parse(await readFile(new URL("summary.json", reference), "utf8"));
assert.equal(summary.exitstatus, 0);
assert.equal(summary.collected, 27178);
const source = await readFile(new URL("events.jsonl", reference), "utf8");
const events = source.trim().split("\n").map(JSON.parse);
const calls = events.filter(event => event.kind === "processor").map((event, caseId) => ({ ...event, caseId }));
assert.equal(calls.length, summary.calls + summary.errors);
assert.equal(calls.filter(event => event.error).length, summary.errors);
assert.ok(calls.every(event => event.model && event.nodeid));
const phases = events.filter(event => event.kind === "result");
assert.equal(phases.length, summary.collected * 3);
assert.ok(phases.every(event => event.outcome === "passed"));
const models = [];
const batchSize = 128;
for (const [id, entries] of Map.groupBy(calls, entry => entry.model)) {
  const snapshot = new URL(`models/${id}/`, reference);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", snapshot), "utf8"));
  const bundled = new URL(`../../models/${manifest.language}-${manifest.direction}/`, import.meta.url);
  let useBundled = false;
  try {
    const shippedManifest = JSON.parse(await readFile(new URL("manifest.json", bundled), "utf8"));
    useBundled = isDeepStrictEqual(manifest.options, shippedManifest.options) && isDeepStrictEqual(manifest.tokenOrders, shippedManifest.tokenOrders);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const source = useBundled ? bundled : snapshot;
  const destination = new URL(`${id}/`, assets);
  await mkdir(destination, { recursive: true });
  const selectedManifest = JSON.parse(await readFile(new URL("manifest.json", source), "utf8"));
  // Rule snapshots use Python order-type names; the runtime accepts the matching direction.
  if (!["tn", "itn"].includes(selectedManifest.direction)) selectedManifest.direction = selectedManifest.direction.endsWith("itn") ? "itn" : "tn";
  await writeFile(new URL("manifest.json", destination), JSON.stringify(selectedManifest));
  for (const file of ["tagger.fst", "verbalizer.fst"]) {
    const compressed = gzipSync(await readFile(new URL(file, source)));
    assert.ok(compressed.byteLength < 25 * 1024 * 1024, "Compressed model exceeds Workers asset limit");
    await writeFile(new URL(`${file}.gz`, destination), compressed);
  }
  for (let start = 0; start < entries.length; start += batchSize) {
    await writeFile(new URL(`${start / batchSize}.json`, destination), JSON.stringify(entries.slice(start, start + batchSize)));
  }
  models.push({ id, language: selectedManifest.language, direction: selectedManifest.direction, options: manifest.options,
    bundled: useBundled, calls: entries.length, batches: Math.ceil(entries.length / batchSize),
    caseIds: entries.map(entry => entry.caseId), requestLimit: entries.some(entry => entry.options.nbest >= 100) ? 16 : 128,
    bytes: Object.values(manifest.files).reduce((sum, file) => sum + file.size, 0) });
}
assert.deepEqual(models.map(model => model.id).sort(), [...summary.models].sort());
assert.equal(models.reduce((sum, model) => sum + model.calls, 0), summary.calls + summary.errors);
const index = { calls: calls.length, expectedErrors: summary.errors, nodeids: new Set(calls.map(event => event.nodeid)).size,
  referenceSha256: createHash("sha256").update(source).digest("hex"), batchSize, models };
await writeFile(new URL("index.json", assets), JSON.stringify(index, null, 2) + "\n");
console.log(JSON.stringify({ models: models.length, calls: calls.length, batches: models.reduce((sum, model) => sum + model.batches, 0) }));
