// Flat config ESLint pour TypeScript (sans type-checking pour rester rapide en CI).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
        // Auto-imports Nuxt/Nitro (h3, runtime)
        defineEventHandler: 'readonly',
        defineNuxtConfig: 'readonly',
        getRouterParam: 'readonly',
        getHeader: 'readonly',
        getQuery: 'readonly',
        getValidatedQuery: 'readonly',
        readBody: 'readonly',
        readValidatedBody: 'readonly',
        readRawBody: 'readonly',
        createError: 'readonly',
        useRuntimeConfig: 'readonly',
        setUserSession: 'readonly',
        requireUserSession: 'readonly',
        clearUserSession: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
)
