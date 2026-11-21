import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', '.tools/**', 'package-lock.json'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent.' },
        { property: 'outerHTML', message: 'Use textContent.' },
        {
          object: 'document',
          property: 'write',
          message: 'Do not use document.write.',
        },
      ],
    },
  },
  {
    files: ['src/background.js', 'src/enforcement.js', 'src/shared.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        chrome: 'readonly',
      },
    },
  },
  {
    files: ['src/popup.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
  },
  prettier,
];
