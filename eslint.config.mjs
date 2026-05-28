import eslint from '@eslint/js';
import globals from 'globals';
import importHelpers from 'eslint-plugin-import-helpers';
import tseslint from 'typescript-eslint';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/prisma/generated/**',
      'apps/web/dist/**',
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      'import-helpers': importHelpers,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          'argsIgnorePattern': '^_',
          'varsIgnorePattern': '^_'
        }
      ],
      'import-helpers/order-imports': [
        'warn',
        {
          newlinesBetween: 'always',
          groups: ['module', '/^@ravoxzap/', ['parent', 'sibling', 'index']],
          alphabetize: { order: 'asc', ignoreCase: true }
        }
      ]
    }
  }
];
