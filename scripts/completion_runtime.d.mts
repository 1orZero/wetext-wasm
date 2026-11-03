import type { WasmModule } from '../src/wasm.js';
import type { Normalizer } from '../dist/index.js';
export function replayCompletionEvent(module: WasmModule | undefined, event: Record<string, unknown>, bytes: Uint8Array | undefined, normalizer?: Normalizer): void;
