import tsParser from '@typescript-eslint/parser'
import tseslintPlugin from '@typescript-eslint/eslint-plugin'
import importPlugin from 'eslint-plugin-import'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**'
    ],
  },
  {
    files: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.cjs', 'src/**/*.mjs'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslintPlugin,
      import: importPlugin,
    },
    rules: {
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      'no-unused-vars': 'off', // handled by TS
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['test/**/*.js', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.test.json'],
      },
    },
    rules: {
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      'no-console': 'off', // Allow console in tests
      'no-undef': 'off', // Tests may define globals
    }
  }
]