import createModule from "./wasm.js";
import type { NativeGraph, WasmModule } from "./wasm.js";
import { loadModel, verifyModel } from "./models.js";
import { nativeCall, Normalizer } from "./processor.js";
import type { Direction, ModelData, RuntimeOptions } from "./types.js";

export { loadModel, UPSTREAM_REVISION } from "./models.js";
export { Normalizer } from "./processor.js";
export { AlignmentError } from "./alignment.js";
export { TokenParseError } from "./tokens.js";
export type * from "./types.js";

export interface CreateNormalizerOptions {
  language?: string;
  direction?: Direction;
  model?: ModelData | URL | string;
  runtime?: RuntimeOptions;
}

let defaultModule: Promise<WasmModule> | undefined;
let nextId = 0;

export async function createNormalizer(options: CreateNormalizerOptions = {}): Promise<Normalizer> {
  const language = options.language ?? "zh";
  const direction = options.direction ?? "itn";
  if (!/^[a-z_]+$/.test(language) || !["tn", "itn"].includes(direction)) {
    throw new TypeError("Invalid language or direction");
  }
  const source = options.model ?? new URL(`../models/${language}-${direction}/`, import.meta.url);
  const model = typeof source === "string" || source instanceof URL ? await loadModel(source) : await verifyModel(source);
  if ((options.language && options.language !== model.manifest.language) ||
      (options.direction && options.direction !== model.manifest.direction)) {
    throw new Error("Model language or direction does not match the requested normalizer");
  }
  if (options.runtime === undefined && !defaultModule) {
    defaultModule = createModule().catch(error => { defaultModule = undefined; throw error; });
  }
  const { wasmModule, ...runtime } = options.runtime ?? {};
  const module = await (options.runtime === undefined ? defaultModule! : createModule(wasmModule ? {
    ...runtime,
    instantiateWasm(imports, receiveInstance) {
      const instance = new WebAssembly.Instance(wasmModule, imports);
      receiveInstance(instance, wasmModule);
      return instance.exports;
    },
  } : runtime));
  const id = nextId++;
  const taggerPath = `/model-${id}-tagger.fst`;
  const verbalizerPath = `/model-${id}-verbalizer.fst`;
  let tagger: NativeGraph | undefined;
  let verbalizer: NativeGraph | undefined;
  const written: string[] = [];
  try {
    module.FS.writeFile(taggerPath, model.tagger);
    written.push(taggerPath);
    module.FS.writeFile(verbalizerPath, model.verbalizer);
    written.push(verbalizerPath);
    tagger = nativeCall(module, () => new module.Graph(taggerPath));
    verbalizer = nativeCall(module, () => new module.Graph(verbalizerPath));
    return new Normalizer(model.manifest, module, tagger, verbalizer);
  } catch (error) {
    tagger?.delete();
    verbalizer?.delete();
    throw error;
  } finally {
    for (const path of written) module.FS.unlink(path);
  }
}
