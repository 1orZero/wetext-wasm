import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = JSON.parse(readFileSync(resolve(root, 'sources.json'), 'utf8'));
const tools = resolve(root, '.tools');
mkdirSync(tools, { recursive: true });

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, { cwd, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ''}`);
  return result.stdout?.trim();
}

function download(url, path, sha256) {
  if (!existsSync(path)) run('curl', ['--fail', '--location', '--retry', '2', url, '-o', `${path}.part`]);
  const source = existsSync(path) ? path : `${path}.part`;
  if (sha256 && createHash('sha256').update(readFileSync(source)).digest('hex') !== sha256) {
    throw new Error(`Checksum mismatch: ${source}`);
  }
  if (source !== path) renameSync(source, path);
}

for (const source of sources.archives) {
  if (source.name === 'emsdk' && process.env.EMSDK) continue;
  const target = resolve(root, source.directory);
  const marker = resolve(target, '.wetext-source');
  if (existsSync(target)) {
    if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === source.sha256) continue;
    if (source.revision && existsSync(resolve(target, '.git')) &&
        run('git', ['rev-parse', 'HEAD'], target, true) === source.revision) {
      run('git', ['diff', '--quiet', 'HEAD', '--'], target);
      writeFileSync(marker, source.sha256 + '\n');
      continue;
    }
    throw new Error(`Cannot verify existing ${target}; move it aside before running setup`);
  }
  const archive = resolve(tools, `${source.name}-source.tar.gz`);
  download(source.url, archive, source.sha256);
  mkdirSync(dirname(target), { recursive: true });
  const staging = mkdtempSync(resolve(dirname(target), '.wetext-extract-'));
  try {
    run('tar', ['-xzf', archive, '-C', staging, '--strip-components=1']);
    writeFileSync(resolve(staging, '.wetext-source'), source.sha256 + '\n');
    renameSync(staging, target);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const emsdk = process.env.EMSDK ?? resolve(tools, 'emsdk');
if (!process.env.EMSDK) {
  run(resolve(emsdk, 'emsdk'), ['install', sources.emscripten], emsdk);
  run(resolve(emsdk, 'emsdk'), ['activate', sources.emscripten], emsdk);
}
const emcc = run(resolve(emsdk, 'upstream/emscripten/emcc'), ['--version'], root, true);
if (!emcc.includes(sources.emscripten)) throw new Error(`Expected Emscripten ${sources.emscripten}`);

const python = process.env.WETEXT_PYTHON ?? resolve(tools, 'python/bin/python');
if (!existsSync(python) && !process.env.WETEXT_PYTHON) {
  const platform = { 'darwin-arm64': 'osx-arm64', 'darwin-x64': 'osx-64', 'linux-x64': 'linux-64', 'linux-arm64': 'linux-aarch64' }[`${process.platform}-${process.arch}`];
  if (!platform) throw new Error('Use WSL or set WETEXT_PYTHON to a compatible Python interpreter');
  const mamba = resolve(tools, 'bin/micromamba');
  if (!existsSync(mamba)) {
    const archive = resolve(tools, 'micromamba.tar.bz2');
    download(`https://micro.mamba.pm/api/micromamba/${platform}/2.10.0`, archive);
    run('tar', ['-xjf', archive, '-C', tools, 'bin/micromamba']);
  }
  run(mamba, ['create', '--yes', '--no-rc', '--root-prefix', resolve(tools, 'mamba'), '--prefix', resolve(tools, 'python'),
    '-c', 'conda-forge', `python=${sources.python}`, `pynini=${sources.pynini}`, `pytest=${sources.pytest}`, `importlib_resources=${sources.importlib_resources}`]);
}
run(python, ['-c', `from importlib.metadata import version; import pynini; assert version('pynini') == '${sources.pynini}'; import pytest, importlib_resources; print('Python model toolchain verified')`]);
console.log('Setup complete. Run npm run build, then npm run models -- --all.');
