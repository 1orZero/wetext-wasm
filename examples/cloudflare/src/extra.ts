import assert from 'node:assert/strict';
import { createNormalizer, type ModelManifest } from 'wetext-wasm';
import wasmModule from 'wetext-wasm/wetext.wasm';
import createWasm from '../../../dist/wasm.js';
import { replayGraphEvent } from '../../../scripts/graph_runtime.mjs';
import { replayCoreEvent } from '../../../scripts/core_runtime.mjs';
import { replayCompletionEvent } from '../../../scripts/completion_runtime.mjs';

interface ExtraEvent extends Record<string, unknown> {
  origin: 'graph' | 'core' | 'completion';
  caseId: number;
  nodeid: string;
  graph?: string;
  model?: string;
}

export async function replayExtra(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  const batch = new URL(request.url).searchParams.get('batch') ?? '';
  if (!/^\d{1,4}$/.test(batch)) return new Response('Invalid batch', { status: 400 });
  const asset = async (path: string): Promise<Response> => {
    const response = await env.ASSETS.fetch(`https://assets.local/qa-extra/${path}`);
    if (!response.ok) throw new Error(`Missing extra QA asset ${path}: ${response.status}`);
    return response;
  };
  const binary = async (path: string): Promise<Uint8Array> => {
    const response = await asset(path);
    if (!response.body) throw new Error(`Empty extra QA asset ${path}`);
    return new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  };
  let normalizer;
  const caseIds: number[] = [];
  const failures: { caseId: number; nodeid: string; error: string }[] = [];
  try {
    const entries: ExtraEvent[] = await (await asset(`${batch}.json`)).json();
    const first = entries[0];
    assert.ok(first);
    assert.ok(entries.every(event => event.origin === first.origin && event.model === first.model && event.graph === first.graph));
    const bytes = first.graph ? await binary(`${first.origin}/${first.graph}.gz`) : undefined;
    const module = first.graph ? await createWasm({ instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(wasmModule, imports);
      receive(instance, wasmModule);
      return instance.exports;
    } }) : undefined;
    if (first.model) {
      const path = `${first.origin}/${first.model}`;
      const manifest: ModelManifest = await (await asset(`${path}/manifest.json`)).json();
      const tagger = await binary(`${path}/tagger.fst.gz`);
      const verbalizer = await binary(`${path}/verbalizer.fst.gz`);
      normalizer = await createNormalizer({ model: { manifest, tagger, verbalizer }, runtime: { wasmModule } });
    }
    for (const event of entries) {
      try {
        if (event.origin === 'graph') assert.equal(replayGraphEvent(module, event, bytes).pass, true);
        else if (event.origin === 'core') replayCoreEvent(module, bytes, event);
        else replayCompletionEvent(module, event, bytes, normalizer);
      } catch (error) { failures.push({ caseId: event.caseId, nodeid: event.nodeid, error: String(error) }); }
      caseIds.push(event.caseId);
    }
    return Response.json({ ok: failures.length === 0, batch: Number(batch), caseIds, failures }, { status: failures.length ? 422 : 200 });
  } catch (error) {
    return Response.json({ ok: false, batch: Number(batch), caseIds, failures, error: String(error) }, { status: 500 });
  } finally { normalizer?.dispose(); }
}
