import assert from 'node:assert/strict';
import { parseTokens, reorderTokens, TokenParseError } from '../dist/tokens.js';
import { replayGraphEvent } from './graph_runtime.mjs';

export function replayCompletionEvent(module, event, bytes, normalizer) {
  if (event.kind === 'parser-error') {
    assert.equal(event.error, 'TokenParseError');
    assert.throws(() => event.operation === 'parse' ? parseTokens(event.tagged)
      : reorderTokens(parseTokens(event.tagged), event.tokenOrders), TokenParseError);
  } else if (event.kind === 'reorder') {
    assert.equal(reorderTokens(parseTokens(event.tagged), event.tokenOrders).text, event.expected);
  } else if (event.kind === 'candidates') {
    const actual = normalizer.candidates(event.input, event.nbest);
    assert.equal(actual.length, event.expected.length);
    for (const [index, candidate] of actual.entries()) {
      const expected = event.expected[index];
      assert.equal(candidate.tagged.text, expected.tagged);
      assert.equal(candidate.output.text, expected.output);
      assert.ok(Math.abs(candidate.tagged.weight - expected.taggerWeight) <= 1e-7);
      assert.ok(Math.abs(candidate.tagged.weight + candidate.output.weight - candidate.bestWeight - expected.weight) <= 1e-7);
    }
  } else if (event.kind === 'unique-stream') {
    const actual = normalizer.candidates(event.input, event.expected.length);
    assert.deepEqual(actual.map(candidate => candidate.output.text), event.expected);
    assert.equal(actual.at(-1).stream.limit, event.limit);
  } else {
    const result = replayGraphEvent(module, event.kind === 'weighted-paths' ? { ...event, operation: 'weighted-paths' } : event, bytes);
    assert.equal(result.pass, true, JSON.stringify({ expected: event.expected, actual: result.actual }));
  }
}
