/** @type {import('jest').Config} */
export default {
  // verbose: true, // Uncomment for detailed test output
  collectCoverage: true,
  coverageDirectory: 'coverage',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    customExportConditions: ['node'],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { configFile: './babel.config.mjs' }],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@uvdsl/solid-oidc-client-browser|mime-types|mime-db|uuid|@noble/curves|@noble/hashes)/)'],
  moduleNameMapper: {
    '^@uvdsl/solid-oidc-client-browser(?:/core)?$': '<rootDir>/test/mocks/solid-oidc-client-browser.ts',
    '^@uvdsl/solid-oidc-client-browser/(.*)$': '<rootDir>/test/mocks/solid-oidc-client-browser.ts',
  },
  setupFilesAfterEnv: ['./test/helpers/setup.ts'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  roots: ['<rootDir>/src', '<rootDir>/test'],
}