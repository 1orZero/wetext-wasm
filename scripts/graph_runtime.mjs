import { parseTokens, reorderTokens } from '../dist/tokens.js';

// The caller supplies bytes; this module has no Node filesystem dependency.
export function replayGraphEvent(module, event, bytes) {
  if (event.kind === 'tokens') {
    const parsed = parseTokens(event.tagged);
    const actual = parsed.map(token => ({ name: token.name,
      members: Object.fromEntries(token.fields), order: [...token.fields.keys()] }));
    return { actual, pass: JSON.stringify(actual) === JSON.stringify(event.expected),
      reordered: reorderTokens(parsed, event.tokenOrders).text };
  }
  const path = `/qa-${event.graph}.fst`;
  module.FS.writeFile(path, bytes);
  let graph, lattice;
  try {
    graph = new module.Graph(path);
    lattice = graph.lattice(event.input);
    const paths = lattice.paths(event.nbest || 1);
    const outputs = paths.map(path => path.text);
    let pass;
    if (event.operation === 'weighted-paths') pass = paths.length === event.expected.length && paths.every((path, index) =>
      path.text === event.expected[index].text && Math.abs(path.weight - event.expected[index].weight) <= 1e-7);
    else if (event.operation === 'weight') pass = Math.abs(paths[0]?.weight - event.expected) <= 1e-7;
    else if (event.operation === 'accepts') pass = (paths.length > 0) === event.expected;
    else if (event.error) pass = paths.length === 0;
    else if (event.operation === 'one_top_rewrite') pass = outputs[0] === event.expected;
    else pass = JSON.stringify(outputs) === JSON.stringify(event.expected);
    return { actual: paths, pass };
  } finally {
    lattice?.delete();
    graph?.delete();
    module.FS.unlink(path);
  }
}
