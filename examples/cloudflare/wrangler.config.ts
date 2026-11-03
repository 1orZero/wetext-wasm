import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
  assetsDirectory: "./.qa-assets",
  rules: [{ type: "Data", globs: ["**/*.fst"], fallthrough: true }],
  dev: { ip: "127.0.0.1", port: 8794 },
  sendMetrics: false,
});
