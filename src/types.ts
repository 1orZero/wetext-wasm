export type Direction = "tn" | "itn";

export interface ModelManifest {
  format: 1;
  upstream: string;
  language: string;
  direction: Direction;
  options: Record<string, boolean>;
  tokenOrders: Record<string, string[]>;
  files: Record<"tagger.fst" | "verbalizer.fst", { sha256: string; size: number }>;
}

export interface ModelData {
  manifest: ModelManifest;
  tagger: Uint8Array;
  verbalizer: Uint8Array;
}

export interface Span {
  start: number;
  end: number;
  text: string;
}

export interface NormalizationMapping {
  kind: "equal" | "delete" | "replace";
  tokenType: string;
  input: Span;
  output: Span;
}

export interface NormalizationResult {
  input: string;
  output: string;
  mappings: NormalizationMapping[];
}

export interface NormalizeOptions {
  nbest?: number;
}

export interface MappingOptions extends NormalizeOptions {
  includeIdentity?: boolean;
}

export interface RuntimeOptions {
  wasmModule?: WebAssembly.Module;
  wasmBinary?: Uint8Array;
  locateFile?: (file: string, prefix: string) => string;
}
