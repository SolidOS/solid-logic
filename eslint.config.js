import tsParser from '@typescript-eslint/parser'
import tseslintPlugin from '@typescript-eslint/eslint-plugin'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

export default [
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.test.ts'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslintPlugin,
      import: importPlugin,
    },
    rules: {
      'semi': ['error', 'never'],
      'quotes': ['error', 'single'],
      'no-unused-vars': 'off', // handled by TS
      '@typescript-eslint/no-unused-vars': ['warn'],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]