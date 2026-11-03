import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
assert.ok(['reference', 'parity'].includes(mode), 'Usage: node scripts/verify.mjs reference|parity');
const root = new URL('../', import.meta.url);
function run(...args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function python(...args) { run('scripts/python.mjs', ...args); }

if (mode === 'reference') python('-m', 'pytest', 'vendor/WeTextProcessing', '-q', '-p', 'scripts.full_reference_plugin');
python('scripts/inventory.py');
run('scripts/full_replay.mjs');
run('scripts/full_matrix.mjs', '--base');
if (mode === 'reference') {
  python('-m', 'pytest', '-q', '-p', 'scripts.graph_reference_plugin',
    ...['tn/german/test', 'itn/german/test', 'tn/korean/test', 'tn/chinese/test/cardinal_test.py']
      .map(path => `vendor/WeTextProcessing/${path}`));
  python('-m', 'pytest', 'vendor/WeTextProcessing', '-q', '-p', 'scripts.completion_reference_plugin');
  python('scripts/core_reference.py');
}
run('scripts/graph_replay.mjs');
run('scripts/core_replay.mjs');
run('scripts/completion_replay.mjs');
python('scripts/scope_coverage.py');
python('scripts/retained_coverage.py');
run('scripts/full_matrix.mjs');
