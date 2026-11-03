import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = resolve(root, ".tools/python/bin/python");
const python = process.env.WETEXT_PYTHON ?? (existsSync(local) ? local : "python3");
const result = spawnSync(python, process.argv.slice(2), {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PYTHONPATH: [resolve(root, "vendor/WeTextProcessing"), root, process.env.PYTHONPATH]
      .filter(Boolean).join(delimiter),
    PYTHONUNBUFFERED: "1",
    XDG_CACHE_HOME: resolve(root, ".tools/cache"),
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
