import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'web/dist/', 'data/', 'prototype/', '_kit/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  { files: ['web/src/**/*.js', 'shared/**/*.js', 'tests/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
];
