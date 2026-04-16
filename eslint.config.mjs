import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'eval() jest zabronione (security).',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'Function constructor jest zabroniony (security).',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML wymaga sanityzacji. Użyj react-markdown + rehype-sanitize.',
        },
      ],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'playwright-report/**'],
  },
];

export default config;
