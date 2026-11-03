import type { WasmModule } from '../src/wasm.js';
export function replayGraphEvent(module: WasmModule | undefined, event: Record<string, unknown>, bytes?: Uint8Array): { actual: unknown; pass: boolean };
