// Flat config ESLint minimale (sans dépendance lourde) pour la V1.
import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    ignores: ['.nuxt/**', '.output/**', 'node_modules/**', 'dist/**', 'coverage/**'],
  },
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off', // géré par le compilateur TS
      'no-undef': 'off', // auto-imports Nuxt
    },
  },
]
