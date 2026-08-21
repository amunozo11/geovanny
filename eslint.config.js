// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Regla clave del proyecto (§32, RC-02): el dinero NUNCA se calcula con float.
 * Se prohíbe la aritmética directa sobre identificadores con nombre de dinero
 * y las conversiones a Number en las capas financieras.
 */
const moneyIdentifier =
  '/^(amount|amounts|price|unitPrice|total|totals|subtotal|rate|rates|cost|unitCost|balance|paid|paidAmount|debt|freight|advance|commission)$/i';

const noFloatMoney = {
  'no-restricted-globals': [
    'error',
    { name: 'parseFloat', message: 'Prohibido en dinero (RC-02). Usa Decimal / toDecimal().' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: `BinaryExpression[operator=/^[*/%]|[+-]$/] > Identifier[name=${moneyIdentifier}]`,
      message:
        'Aritmética de punto flotante sobre un valor monetario (RC-02 / §32). Usa Decimal: D(a).times(b), D(a).plus(b)…',
    },
    {
      selector: `BinaryExpression[operator=/^[*/%]|[+-]$/] > MemberExpression[property.name=${moneyIdentifier}]`,
      message:
        'Aritmética de punto flotante sobre un valor monetario (RC-02 / §32). Usa Decimal.',
    },
    {
      selector: `CallExpression[callee.name='Number'] > MemberExpression[property.name=${moneyIdentifier}]`,
      message: 'No conviertas dinero a Number (RC-02). Se pierde precisión.',
    },
    {
      selector: `CallExpression[callee.property.name='toFixed']`,
      message: 'toFixed() redondea en float. Usa el redondeo por moneda de shared/money.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Capas financieras: la regla del dinero es obligatoria
    files: ['shared/src/money/**/*.ts', 'server/src/domain/**/*.ts', 'server/src/services/**/*.ts'],
    rules: noFloatMoney,
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
