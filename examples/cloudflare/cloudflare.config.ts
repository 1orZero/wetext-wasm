import { bindings, defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "qa-wetext-wasm",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-11-03",
    compatibilityFlags: ["new_module_registry"],
    workersDev: true,
    limits: { cpuMs: 30000 },
    env: { ASSETS: bindings.assets() },
    observability: {
      enabled: true,
      traces: { enabled: true },
    },
  },
});
