import { buildConfig } from "solidos-toolkit/vite";
import { defineConfig } from "vitest/config";

const build = buildConfig({ entry: "src/index.ts" }) ?? {};

export default defineConfig({
  build,
  test: {
    environment: "jsdom",
    setupFiles: ["test/helpers/setup.ts"],
    coverage: {
      include: ["src/**/*.[jt]s"],
    },
  },
});
