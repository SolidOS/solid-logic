/** @type {import("jest").Config} */
export default {
  // verbose: true, // Uncomment for detailed test output
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    customExportConditions: ["node"],
  },
  transform: {
    "^.+\\.[tj]sx?$": ["babel-jest", { configFile: "./babel.config.js" }],
  },
  setupFilesAfterEnv: ["./test/helpers/setup.ts"],
  testMatch: ["**/__tests__/**/*.ts?(x)", "**/?(*.)+(spec|test).ts?(x)"],
  roots: ["<rootDir>/src", "<rootDir>/test"],
};