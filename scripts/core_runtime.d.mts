import type { WasmModule } from '../src/wasm.js';
export function replayCoreEvent(module: WasmModule | undefined, bytes: Uint8Array | undefined, event: Record<string, unknown>): unknown;
