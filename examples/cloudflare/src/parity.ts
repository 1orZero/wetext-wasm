import { createNormalizer, type ModelManifest } from "wetext-wasm";
import wasmModule from "wetext-wasm/wetext.wasm";
import { compareEvent, type ProcessorEvent } from "../../../scripts/compare_event.mjs";

interface ReferenceCall extends ProcessorEvent {
  caseId: number;
}

export async function replayBatch(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  const query = new URL(request.url).searchParams;
  const id = query.get("model") ?? "";
  const batch = query.get("batch") ?? "0";
  const limit = Number(query.get("limit") ?? 128);
  const offset = Number(query.get("offset") ?? 0);
  if (!/^[a-f0-9]{64}$/.test(id) || !/^\d{1,5}$/.test(batch) || !Number.isInteger(limit) || limit < 1 || limit > 128 || !Number.isInteger(offset) || offset < 0 || offset >= 128) {
    return new Response("Invalid model, batch, offset or limit", { status: 400 });
  }
  const asset = async (file: string): Promise<Response> => {
    const result = await env.ASSETS.fetch(`https://assets.local/qa-full-parity/${id}/${file}`);
    if (!result.ok) throw new Error(`Missing QA asset ${file}: ${result.status}`);
    return result;
  };
  const started = performance.now();
  const failures: { index: number; nodeid: string; method: string; input: string; error: string }[] = [];
  const caseIds: number[] = [];
  let expectedErrors = 0;
  let checked = 0;
  try {
    const manifest: ModelManifest = await (await asset("manifest.json")).json();
    const entries: ReferenceCall[] = await (await asset(`${batch}.json`)).json();
    const binary = async (name: string): Promise<Uint8Array> => {
      const response = await asset(`${name}.gz`);
      if (!response.body) throw new Error(`Empty QA asset ${name}`);
      return new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    };
    const tagger = await binary("tagger.fst");
    const verbalizer = await binary("verbalizer.fst");
    const normalizer = await createNormalizer({ model: { manifest, tagger, verbalizer }, runtime: { wasmModule } });
    const initializedMs = performance.now() - started;
    try {
      for (const entry of entries.slice(offset, offset + limit)) {
        try {
          compareEvent(normalizer, entry);
        } catch (error) {
          failures.push({ index: offset + checked, nodeid: entry.nodeid, method: entry.method, input: entry.input, error: String(error) });
        }
        caseIds.push(entry.caseId);
        if (entry.error) expectedErrors++;
        checked++;
      }
    } finally { normalizer.dispose(); }
    return Response.json({ ok: failures.length === 0, id, batch: Number(batch), offset, checked, caseIds, expectedErrors, failures,
      initializedMs, elapsedMs: performance.now() - started }, { status: failures.length ? 422 : 200 });
  } catch (error) {
    return Response.json({ ok: false, id, batch: Number(batch), offset, checked, failures, error: String(error),
      elapsedMs: performance.now() - started }, { status: 500 });
  }
}
