import assert from "node:assert/strict";
import { createNormalizer, type ModelManifest } from "wetext-wasm";
import wasmModule from "wetext-wasm/wetext.wasm";
import manifest from "wetext-wasm/models/zh-itn/manifest.json";
import tagger from "wetext-wasm/models/zh-itn/tagger.fst";
import verbalizer from "wetext-wasm/models/zh-itn/verbalizer.fst";
import { replayBatch } from "./parity";
import { replayExtra } from "./extra";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/qa-parity") return replayBatch(request, env);
    if (new URL(request.url).pathname === "/qa-extra") return replayExtra(request, env);
    if (new URL(request.url).pathname !== "/qa") return new Response("Not found", { status: 404 });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
    const normalizer = await createNormalizer({
      model: {
        manifest: manifest as ModelManifest,
        tagger: new Uint8Array(tagger),
        verbalizer: new Uint8Array(verbalizer),
      },
      runtime: { wasmModule },
    });
    try {
      const output = normalizer.normalize("二十三");
      assert.equal(output, "23");
      assert.equal(normalizer.normalize("百分之三十"), "30%");
      assert.deepEqual(normalizer.normalize("一二", { nbest: 3 }), ["1~2", "一二"]);
      assert.equal(normalizer.verbalize(normalizer.tag("二十三")), "23");
      const mapping = normalizer.normalizeWithMapping("😀二十三");
      assert.equal(mapping.output, "😀23");
      assert.deepEqual(mapping.mappings[0]?.input, { start: 1, end: 4, text: "二十三" });
      assert.deepEqual(mapping.mappings[0]?.output, { start: 1, end: 3, text: "23" });
      assert.equal(normalizer.normalize(""), "");
      assert.throws(() => normalizer.verbalize('qa_unknown { value: "x" }'), /no WFST path/);
      assert.equal(normalizer.normalize("二十三"), "23");
      normalizer.dispose();
      assert.throws(() => normalizer.normalize("二十三"), /disposed/);
      return Response.json({ ok: true, runtime: "cloudflare-workers", model: "zh-itn", output, mapping });
    } finally {
      normalizer.dispose();
    }
  },
} satisfies ExportedHandler<Env>;
