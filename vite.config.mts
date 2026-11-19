import { isAbsolute } from 'node:path'
import { buildConfig } from "solidos-toolkit/vite";
import { defineConfig } from "vitest/config";

const bundledCjsDependencies = new Set([
  '@dokieli/web-access-control',
  '@rdfjs/data-model',
  '@rdfjs/types',
  'n3'
])

const build = buildConfig({
  entry: "src/index.ts",
  overrides: {
    rolldownOptions: {
      external: (id: string) => {
        if (bundledCjsDependencies.has(id)) return false
        return !id.startsWith("~icons/") && !id.startsWith("@/") && !id.startsWith(".") && !isAbsolute(id)
      }
    }
  }
}) ?? {};

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
