'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');

const sharedRules = {
  'no-console': 'off',
  'no-var': 'error',
  'prefer-const': 'error',
  'object-shorthand': 'error',
  eqeqeq: ['error', 'smart'],
  curly: ['error', 'multi-line'],
  'no-unused-vars': ['error', { argsIgnorePattern: '^(req|res|next|_)', caughtErrors: 'none' }],
  'no-return-await': 'error',
  'no-throw-literal': 'error',
};

module.exports = [
  {
    ignores: ['node_modules/**', 'frontend/node_modules/**', 'frontend/build/**', 'project_venv/**'],
  },

  // Backend: CommonJS on Node.
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules, ...sharedRules },
  },

  // Frontend: ES modules with JSX in the browser. Parsed by the default parser
  // with JSX enabled, so no extra plugin is needed just to catch real errors.
  {
    files: ['frontend/src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, process: 'readonly' },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...sharedRules,
      // The new JSX transform means components never reference `React` directly.
      'react/react-in-jsx-scope': 'off',
    },
  },
];
