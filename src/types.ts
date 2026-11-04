// Copyright (c) 2026, WENET COMMUNITY.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified Python mapping types into TypeScript interfaces for wetext-wasm.
// Source: https://github.com/wenet-e2e/WeTextProcessing/blob/c3b4d88d11c5efef817881f7e515cbdd3a19d99b/tn/alignment.py

export type Direction = "tn" | "itn";

export interface ModelManifest {
  format: 1;
  upstream: string;
  generator?: { name: string; version: string };
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
