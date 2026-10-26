import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

// Contrôle automatique du code (npm run lint) : règles des hooks React et erreurs courantes.
// Le typage reste vérifié par TypeScript (npm run build).
export default [
  { ignores: ['dist/', 'supabase/', 'public/'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    plugins: { 'react-hooks': hooks, '@typescript-eslint': tseslint.plugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `_x` : valeur volontairement ignorée (ex. propriété retirée d'un objet par décomposition).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-self-assign': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-cond-assign': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      eqeqeq: ['warn', 'smart'],
    },
  },
];
