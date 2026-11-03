export interface WeightedOutput {
  text: string;
  weight: number;
}

export interface Trace {
  text: string;
  arcs: number[];
}

export interface NativeLattice {
  paths(count: number): WeightedOutput[];
  delete(): void;
}

export interface NativeGraph {
  lattice(input: string): NativeLattice;
  trace(input: string, output: string, constrain: boolean): Trace;
  delete(): void;
}

export interface WasmModule {
  Graph: new (path: string) => NativeGraph;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
  getExceptionMessage(exception: unknown): [string, string];
  decrementExceptionRefcount(exception: unknown): void;
}

export default function createModule(options?: {
  wasmBinary?: Uint8Array;
  locateFile?: (file: string, prefix: string) => string;
  instantiateWasm?: (
    imports: WebAssembly.Imports,
    receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
  ) => WebAssembly.Exports;
}): Promise<WasmModule>;
