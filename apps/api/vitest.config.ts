import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@boss/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
    },
  },
});
