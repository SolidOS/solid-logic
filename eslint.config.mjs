import tsParser from '@typescript-eslint/parser'
import importPlugin from 'eslint-plugin-import'

export default [
  {
    ignores: [
      'dist/**',
      'lib/**',
      'node_modules/**',
      'coverage/**'
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        sourceType: 'module',
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Style rules (not handled by TypeScript)
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      
      // Disable ESLint rules that TypeScript handles better
      'no-unused-vars': 'off', // TypeScript handles this via noUnusedLocals
      'no-undef': 'off', // TypeScript handles undefined variables
    },
  },
  {
    files: ['test/**/*.ts'],
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