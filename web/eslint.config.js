import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const restricted = [
  {
    selector: "NewExpression[callee.name='Date']:matches([arguments.0.type='TemplateLiteral'], [arguments.0.raw=/^[\"']/])",
    message: 'Transaction dates are local YYYY-MM-DD strings; use src/lib/localDate.ts.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
    message: 'Transaction dates are local YYYY-MM-DD strings; use src/lib/localDate.ts.',
  },
  {
    selector: "CallExpression[callee.name=/^(Number|parseFloat)$/]",
    message: 'Money stays a decimal string; only src/lib/barScale.ts may convert it, to size a bar.',
  },
]

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: { 'no-restricted-syntax': ['error', ...restricted] },
  },
  {
    files: ['src/lib/barScale.ts'],
    rules: { 'no-restricted-syntax': ['error', ...restricted.slice(0, 2)] },
  },
)
