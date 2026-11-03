import type { MappingOptions, Normalizer } from '../dist/index.js';

export interface ProcessorEvent {
  nodeid: string;
  method: 'normalize' | 'normalizeWithMapping' | 'tag' | 'verbalize';
  input: string;
  options: MappingOptions;
  expected?: unknown;
  error?: { type: string; message: string };
}

export function compareEvent(normalizer: Normalizer, event: ProcessorEvent): void;
