// ESLint (flat config) com fronteiras da Clean Architecture via eslint-plugin-boundaries.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  // violations/ guarda exemplos que DEVEM falhar; scripts/check-violations.mjs os verifica.
  { ignores: ['node_modules/', 'dist/', 'violations/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Scripts de verificação rodam no Node.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Resolve os aliases (@domain/*, @infrastructure/*...) pelo tsconfig, para que
      // import por alias e import relativo sejam classificados igualmente.
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      // A ordem importa: o primeiro padrão que casa classifica o arquivo.
      // Por isso o Composition Root vem antes da Presentation.
      'boundaries/elements': [
        { type: 'composition-root', pattern: '*/Presentation/di' },
        { type: 'domain', pattern: '*/Domain' },
        { type: 'application', pattern: '*/Application' },
        { type: 'infrastructure', pattern: '*/Infrastructure' },
        { type: 'presentation', pattern: '*/Presentation' },
        { type: 'content', pattern: '*/Content' },
      ],
    },
    rules: {
      // Todo arquivo .ts precisa pertencer a uma camada: nada escapa da matriz por não estar classificado.
      'boundaries/no-unknown-files': 2,
      // Matriz de dependências: tudo o que não está liberado aqui é proibido.
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          policies: [
            // Domain ➔ nada (só ele mesmo).
            { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
            {
              from: { element: { type: 'application' } },
              allow: { to: { element: { types: { anyOf: ['application', 'domain'] } } } },
            },
            {
              from: { element: { type: 'infrastructure' } },
              allow: { to: { element: { types: { anyOf: ['infrastructure', 'application', 'domain'] } } } },
            },
            {
              from: { element: { type: 'presentation' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['presentation', 'composition-root', 'application', 'domain', 'content'] },
                  },
                },
              },
            },
            {
              from: { element: { type: 'composition-root' } },
              allow: {
                to: { element: { types: { anyOf: ['composition-root', 'infrastructure', 'application', 'domain'] } } },
              },
            },
            // Content ➔ nada (só ele mesmo).
            { from: { element: { type: 'content' } }, allow: { to: { element: { type: 'content' } } } },
          ],
        },
      ],
    },
  },
);
