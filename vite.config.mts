import { buildConfig } from "solidos-toolkit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  build: buildConfig({ entry: "src/index.ts" }),
  test: {
    environment: "jsdom",
    setupFiles: ["test/helpers/setup.ts"],
    coverage: {
      include: ["src/**/*.[jt]s"],
    },
  },
});
