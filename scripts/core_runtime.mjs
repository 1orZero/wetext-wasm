import assert from 'node:assert/strict';
import { parseTokens, reorderTokens } from '../dist/tokens.js';
import { traceInputSpans, traceOutputSpans } from '../dist/alignment.js';
import { nativeCall } from '../dist/processor.js';

// This module accepts preloaded WASM and graph bytes so the same contract runs in Workers.
export function replayCoreEvent(module, graphBytes, event) {
  if (event.kind === 'parser') {
    if (event.error) {
      assert.throws(() => parseTokens(event.input));
      return;
    }
    const tokens = parseTokens(event.input);
    assert.deepEqual(tokens.map(token => ({ name: token.name, fields: [...token.fields] })), event.tokens);
    if (event.reordered !== undefined) {
      const orders = { time: ['hour', 'minute'], money: ['value', 'currency'] };
      assert.equal(reorderTokens(tokens, orders).text, event.reordered);
    }
    return;
  }
  if (event.kind === 'graph') {
    if (!module || !graphBytes) throw new Error('WASM module and graph bytes required');
    const path = `/qa-core-${event.id}.fst`;
    module.FS.writeFile(path, graphBytes);
    const graph = new module.Graph(path);
    try {
      if (event.mode === 'missing') {
        assert.throws(() => nativeCall(module, () => graph.trace(event.input, event.output ?? '', event.output != null)), /no WFST path/);
        return;
      }
      const trace = nativeCall(module, () => graph.trace(event.input, event.output ?? '', event.output != null));
      assert.equal(trace.text, event.expected);
      if (event.mode === 'input') assert.deepEqual(traceInputSpans(event.input, trace.text, trace, event.spans), event.expectedSpans);
      if (event.mode === 'output') assert.deepEqual(traceOutputSpans(event.input, trace, event.spans), event.expectedSpans);
      if (event.mode === 'output-error') assert.throws(() => traceOutputSpans(event.input, trace, event.spans), /input spans must not be empty/);
      return trace;
    } finally {
      graph.delete();
      module.FS.unlink(path);
    }
  }
  throw new Error(`Unknown core event kind: ${event.kind}`);
}
