// Fronteiras da Clean Architecture (mesma matriz do produto): a Presentation só conhece a Infrastructure no di/.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/vite-env.d.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': [
        { type: 'composition-root', pattern: 'src/Presentation/di' },
        { type: 'domain', pattern: 'src/Domain' },
        { type: 'application', pattern: 'src/Application' },
        { type: 'infrastructure', pattern: 'src/Infrastructure' },
        { type: 'presentation', pattern: 'src/Presentation' },
        { type: 'content', pattern: 'src/Content' },
        { type: 'test', pattern: 'src/tests' },
      ],
    },
    rules: {
      'boundaries/no-unknown-files': 2,
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          policies: [
            { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
            { from: { element: { type: 'application' } }, allow: { to: { element: { types: { anyOf: ['application', 'domain'] } } } } },
            { from: { element: { type: 'infrastructure' } }, allow: { to: { element: { types: { anyOf: ['infrastructure', 'application', 'domain', 'content'] } } } } },
            { from: { element: { type: 'presentation' } }, allow: { to: { element: { types: { anyOf: ['presentation', 'composition-root', 'application', 'domain', 'content'] } } } } },
            { from: { element: { type: 'composition-root' } }, allow: { to: { element: { types: { anyOf: ['composition-root', 'infrastructure', 'application', 'domain'] } } } } },
            { from: { element: { type: 'content' } }, allow: { to: { element: { type: 'content' } } } },
            { from: { element: { type: 'test' } }, allow: { to: { element: { type: '*' } } } },
          ],
        },
      ],
    },
  },
);
