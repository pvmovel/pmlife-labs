// Fronteiras da Clean Architecture no lado TS (web/): a Presentation só conhece os adapters no di/.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/**/*.{ts,tsx}'],
    ignores: ['web/vite-env.d.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': [
        { type: 'composition-root', pattern: 'web/Presentation/di' },
        { type: 'domain', pattern: 'web/Domain' },
        { type: 'application', pattern: 'web/Application' },
        { type: 'infrastructure', pattern: 'web/Infrastructure' },
        { type: 'presentation', pattern: 'web/Presentation' },
        { type: 'content', pattern: 'web/Content' },
        { type: 'test', pattern: 'web/tests' },
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
            { from: { element: { type: 'infrastructure' } }, allow: { to: { element: { types: { anyOf: ['infrastructure', 'application', 'domain'] } } } } },
            { from: { element: { type: 'presentation' } }, allow: { to: { element: { types: { anyOf: ['presentation', 'composition-root', 'application', 'domain'] } } } } },
            { from: { element: { type: 'composition-root' } }, allow: { to: { element: { types: { anyOf: ['composition-root', 'infrastructure', 'application', 'domain', 'content'] } } } } },
            { from: { element: { type: 'content' } }, allow: { to: { element: { type: 'content' } } } },
            { from: { element: { type: 'test' } }, allow: { to: { element: { type: '*' } } } },
          ],
        },
      ],
    },
  },
);
