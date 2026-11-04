import type { ModelData, ModelManifest } from "./types.js";

export const UPSTREAM_REVISION = "c3b4d88d11c5efef817881f7e515cbdd3a19d99b";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateManifest(value: unknown): ModelManifest {
  if (!record(value) || value.format !== 1 || value.upstream !== UPSTREAM_REVISION ||
      typeof value.language !== "string" || !/^[a-z_]+$/.test(value.language) ||
      (value.direction !== "tn" && value.direction !== "itn") ||
      !record(value.options) || !record(value.tokenOrders) || !record(value.files)) {
    throw new TypeError("Invalid or incompatible WeText model manifest");
  }
  let generator: ModelManifest["generator"];
  if (value.generator !== undefined) {
    if (!record(value.generator) || typeof value.generator.name !== "string" || !value.generator.name.trim() ||
        typeof value.generator.version !== "string" || !value.generator.version.trim()) {
      throw new TypeError("Invalid model generator metadata");
    }
    generator = Object.freeze({ name: value.generator.name, version: value.generator.version });
  }
  const options: Record<string, boolean> = {};
  for (const [key, option] of Object.entries(value.options)) {
    if (typeof option !== "boolean") throw new TypeError("Model options must be boolean");
    Object.defineProperty(options, key, { value: option, enumerable: true });
  }
  const tokenOrders: Record<string, string[]> = {};
  for (const [key, fields] of Object.entries(value.tokenOrders)) {
    if (!Array.isArray(fields) || !fields.every(field => typeof field === "string" && /^[A-Za-z_]+$/.test(field)) ||
        new Set(fields).size !== fields.length) throw new TypeError("Invalid token field order");
    Object.defineProperty(tokenOrders, key, { value: Object.freeze([...fields]), enumerable: true });
  }
  const file = (name: string): { sha256: string; size: number } => {
    const metadata = (value.files as Record<string, unknown>)[name];
    if (!record(metadata) || typeof metadata.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.sha256) ||
        typeof metadata.size !== "number" || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > 2147483647) {
      throw new TypeError(`Invalid model file metadata: ${name}`);
    }
    return Object.freeze({ sha256: metadata.sha256, size: metadata.size });
  };
  return Object.freeze({
    format: 1,
    upstream: UPSTREAM_REVISION,
    ...(generator === undefined ? {} : { generator }),
    language: value.language,
    direction: value.direction,
    options: Object.freeze(options),
    tokenOrders: Object.freeze(tokenOrders),
    files: Object.freeze({ "tagger.fst": file("tagger.fst"), "verbalizer.fst": file("verbalizer.fst") }),
  });
}

export async function verifyModel(model: ModelData): Promise<ModelData> {
  const manifest = validateManifest(model.manifest);
  const checked = async (value: Uint8Array, name: "tagger.fst" | "verbalizer.fst"): Promise<Uint8Array> => {
    if (!(value instanceof Uint8Array) || value.length !== manifest.files[name].size) {
      throw new TypeError(`Invalid model file size: ${name}`);
    }
    const data = new Uint8Array(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (hash !== manifest.files[name].sha256) throw new Error(`Model checksum mismatch: ${name}`);
    return data;
  };
  const [tagger, verbalizer] = await Promise.all([checked(model.tagger, "tagger.fst"), checked(model.verbalizer, "verbalizer.fst")]);
  return { manifest, tagger, verbalizer };
}

async function read(url: URL): Promise<Uint8Array> {
  if (url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    return readFile(url);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadModel(directory: string | URL): Promise<ModelData> {
  const base = new URL(directory instanceof URL ? directory.href : directory);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const manifest = validateManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await read(new URL("manifest.json", base)))));
  const [tagger, verbalizer] = await Promise.all([read(new URL("tagger.fst", base)), read(new URL("verbalizer.fst", base))]);
  return verifyModel({ manifest, tagger, verbalizer });
}
