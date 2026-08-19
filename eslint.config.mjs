import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fsdBoundaries = require('./eslint-rules/fsd-boundaries.cjs');
const fsdPublicApi = require('./eslint-rules/fsd-public-api.cjs');

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'target/**',
      'node_modules/**',
      'src/shared/api/generated/**',
      'eslint-rules/**',
      'src-tauri/**',
      '.superpowers/**',
      'docs/superpowers/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      fsd: { rules: { boundaries: fsdBoundaries, 'public-api': fsdPublicApi } },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'fsd/boundaries': 'error',
      'fsd/public-api': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly' },
    },
  },
  {
    files: ['workers/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        console: 'readonly',
      },
    },
  },
);
