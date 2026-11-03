import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const emsdk = process.env.EMSDK ?? resolve(root, ".tools/emsdk");
const emcmake = resolve(emsdk, "upstream/emscripten/emcmake");
if (!existsSync(emcmake)) throw new Error("Install Emscripten 6.0.13 or set EMSDK; see README.md");
const env = { ...process.env, PATH: `${dirname(emcmake)}:${process.env.PATH}` };
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(emcmake, ["cmake", "-S", ".", "-B", "build", "-DCMAKE_BUILD_TYPE=Release"]);
run("cmake", ["--build", "build", "--target", "wetext", "--parallel", "4"]);
run(process.execPath, ["node_modules/typescript/bin/tsc"]);
mkdirSync(resolve(root, "dist"), { recursive: true });
cpSync(resolve(root, "build/wetext.js"), resolve(root, "dist/wasm.js"));
cpSync(resolve(root, "build/wetext.wasm"), resolve(root, "dist/wetext.wasm"));
cpSync(resolve(root, "src/wasm.d.ts"), resolve(root, "dist/wasm.d.ts"));
