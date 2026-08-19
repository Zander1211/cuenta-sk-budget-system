import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Maintenance scripts and serverless handlers run on Node, not in a
    // browser. Without this they are linted against browser globals and every
    // use of `process` is reported as undefined.
    files: ['scripts/**/*.{js,mjs,cjs}', 'api/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // These files are not React components; the Vite fast-refresh rule does
      // not apply to them.
      'react-refresh/only-export-components': 'off',
    },
  },
])
