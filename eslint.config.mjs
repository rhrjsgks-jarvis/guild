import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'apps-script/**', 'shots/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // 쓰지 않는 변수는 실수일 때가 많지만, _ 로 시작하면 의도적으로 버린 것으로 본다
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // 빌드 스크립트는 Node 환경이고 Next 규칙이 적용되지 않는다
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
