import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['public/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  // Node scripts and tests; e2e tests also run callbacks inside the page.
  { files: ['*.js', 'scripts/**', 'test/**'], languageOptions: { globals: globals.node } },
  { files: ['e2e/**'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
