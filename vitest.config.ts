import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // "react-server" makes the "server-only" marker package a no-op here,
    // matching how Next's own server bundler resolves it — without this,
    // any test importing a server-only-guarded module throws immediately.
    conditions: ["react-server", "node"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  ssr: {
    resolve: {
      conditions: ["react-server", "node"],
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
