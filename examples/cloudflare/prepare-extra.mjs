import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const data = new URL('../../.test-data/', import.meta.url);
const assets = new URL('.qa-assets/qa-extra/', import.meta.url);
await mkdir(assets, { recursive: true });
const events = [];
for (const origin of ['graph', 'core', 'completion']) {
  const reference = new URL(`qa-${origin}-reference/`, data);
  const source = origin === 'core'
    ? [...JSON.parse(await readFile(new URL('parser.json', reference))).map(row => ({ ...row, kind: 'parser' })),
       ...JSON.parse(await readFile(new URL('alignment.json', reference))).map(row => ({ ...row, kind: 'graph' }))]
    : (await readFile(new URL('events.jsonl', reference), 'utf8')).trim().split('\n').map(JSON.parse);
  if (origin !== 'core') assert.equal(JSON.parse(await readFile(new URL('summary.json', reference))).exitstatus, 0);
  const copied = new Set();
  for (const event of source) {
    const destination = new URL(`${origin}/`, assets);
    await mkdir(destination, { recursive: true });
    if (event.graph && !copied.has(event.graph)) {
      const path = origin === 'core' ? event.graph : `graphs/${event.graph}.fst`;
      await writeFile(new URL(`${event.graph}.gz`, destination), gzipSync(await readFile(new URL(path, reference))));
      copied.add(event.graph);
    }
    if (event.model && !copied.has(event.model)) {
      const model = new URL(`models/${event.model}/`, reference);
      const target = new URL(`${event.model}/`, destination);
      await mkdir(target, { recursive: true });
      await writeFile(new URL('manifest.json', target), await readFile(new URL('manifest.json', model)));
      for (const name of ['tagger.fst', 'verbalizer.fst']) await writeFile(new URL(`${name}.gz`, target), gzipSync(await readFile(new URL(name, model))));
      copied.add(event.model);
    }
    events.push({ ...event, origin, caseId: events.length });
  }
}
const batches = [];
// A batch owns at most one model or raw graph, keeping Workers memory bounded.
for (const entries of Map.groupBy(events, event => `${event.origin}/${event.model ?? event.graph ?? 'parser'}`).values()) {
  for (let start = 0; start < entries.length; start += 16) {
    const chunk = entries.slice(start, start + 16);
    const id = batches.length;
    await writeFile(new URL(`${id}.json`, assets), JSON.stringify(chunk));
    batches.push({ id, caseIds: chunk.map(event => event.caseId) });
  }
}
const index = { events: events.length, nodeids: new Set(events.map(event => event.nodeid)).size,
  referenceSha256: createHash('sha256').update(JSON.stringify(events)).digest('hex'), batches };
const processorResults = JSON.parse(await readFile(new URL('qa-full-coverage/processor-results.json', data)));
const runtimeIds = new Set([...events.map(event => event.nodeid),
  ...processorResults.filter(row => row.calls > 0 && row.calls === row.replayed && row.failures.length === 0).map(row => row.nodeid)]);
const matrix = JSON.parse(await readFile(new URL('qa-full-coverage/matrix.json', data)));
assert.equal(matrix.length, 27178);
assert.ok(matrix.every(row => ['js-runtime-pass', 'js-runtime-and-python-build-pass', 'python-build-pass'].includes(row.status)), 'Complete the coverage matrix before preparing Workers assets');
const runtimeCases = matrix.filter(row => row.status.startsWith('js-'));
const aliases = [];
for (const row of runtimeCases) {
  if (runtimeIds.has(row.nodeid)) continue;
  const targets = row.supplements.flatMap(item => item.runtimeNodeids ?? []);
  assert.ok(targets.length && targets.every(id => runtimeIds.has(id)), `Workers lacks runtime evidence for ${row.nodeid}`);
  aliases.push({ nodeid: row.nodeid, runtimeNodeids: targets });
}
index.runtimeCases = runtimeCases.length;
index.aliases = aliases;
await writeFile(new URL('index.json', assets), JSON.stringify(index, null, 2) + '\n');
console.log({ events: events.length, batches: batches.length });
