import assert from 'node:assert/strict';

export function compareEvent(normalizer, event) {
  try {
    const actual = normalizer[event.method](event.input, event.options);
    assert.equal(event.error, undefined, 'Expected JavaScript to throw');
    assert.deepEqual(actual, event.expected);
  } catch (error) {
    const expected = event.error?.message === 'Operation failed' ? 'no WFST path for the requested input'
      : event.error?.message === 'nbest must be a positive integer' ? 'nbest must be a positive 32-bit integer'
      : event.error?.message;
    if (!event.error || error instanceof assert.AssertionError || error.message !== expected) throw error;
  }
}
