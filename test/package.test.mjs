import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the packed archive installs offline and supports JavaScript and TypeScript consumers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qa-wetext-package-'));
  const run = (command, args, cwd = directory) => {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, npm_config_cache: join(directory, 'npm-cache') } });
    assert.equal(result.status, 0, result.error?.message ?? `${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], root));
  const files = new Set(packed.files.map(file => file.path));
  assert.ok(files.has('dist/wetext.wasm'));
  assert.ok(files.has('dist/index.d.ts'));
  for (const name of await readdir(resolve(root, 'licenses'))) assert.ok(files.has(`licenses/${name}`));
  assert.ok(![...files].some(path => /^(vendor|\.tools|\.test-data|node_modules)\//.test(path)));
  const modelNames = await readdir(resolve(root, 'models'));
  for (const model of modelNames) {
    for (const name of ['manifest.json', 'tagger.fst', 'verbalizer.fst']) assert.ok(files.has(`models/${model}/${name}`));
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(directory, packed.filename)]);
  const source = `import { createNormalizer, type NormalizationResult } from 'wetext-wasm';
const n = await createNormalizer();
const result: NormalizationResult = n.normalizeWithMapping('😀二十三');
if (result.output !== '😀23' || result.mappings[0]?.input.start !== 1) throw new Error('Package runtime mismatch');
n.dispose();
console.log(result.output);
`;
  await writeFile(join(directory, 'consumer.ts'), source);
  run(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--strict', '--target', 'es2022', '--lib', 'es2023,dom', '--module', 'nodenext', 'consumer.ts']);
  assert.equal(run(process.execPath, ['consumer.js']).trim(), '😀23');
  await writeFile(join(directory, 'consumer.cjs'), `import('wetext-wasm').then(async ({ createNormalizer }) => {
  const normalizer = await createNormalizer();
  try {
    if (normalizer.normalize('二十三') !== '23') throw new Error('CommonJS dynamic import mismatch');
  } finally { normalizer.dispose(); }
}).catch(error => { console.error(error); process.exitCode = 1; });
`);
  run(process.execPath, ['consumer.cjs']);
  const manifest = JSON.parse(await readFile(join(directory, 'node_modules/wetext-wasm/package.json'), 'utf8'));
  assert.ok(!manifest.dependencies || Object.keys(manifest.dependencies).length === 0);
  await mkdir(resolve(root, '.test-data'), { recursive: true });
  await writeFile(resolve(root, '.test-data/qa-package-summary.json'), JSON.stringify({
    directory, filename: join(directory, packed.filename), bytes: packed.size,
    unpackedBytes: packed.unpackedSize, bundledModels: modelNames.length,
    sha512: packed.integrity, consumer: 'ES modules + CommonJS dynamic import + TypeScript, offline install',
  }, null, 2) + '\n');
  console.log(`Package consumer verified: ${directory}`);
});
