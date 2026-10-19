// Fronteiras: o Domain (movimento, câmera, mapa, NPCs) é TypeScript puro; a Application (conversa com o NPC) só
// conhece a porta; a Infrastructure implementa a porta (HTTP); só a Presentation conhece React e three.js.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.e2e-dist/', 'e2e-dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', setTimeout: 'readonly', fetch: 'readonly', document: 'readonly', window: 'readonly' } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/vite-env.d.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/Domain' },
        { type: 'application', pattern: 'src/Application' },
        { type: 'infrastructure', pattern: 'src/Infrastructure' },
        { type: 'content', pattern: 'src/Content' },
        { type: 'presentation', pattern: 'src/Presentation' },
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
            { from: { element: { type: 'infrastructure' } }, allow: { to: { element: { types: { anyOf: ['infrastructure', 'application', 'domain'] } } } } },
            { from: { element: { type: 'content' } }, allow: { to: { element: { type: 'content' } } } },
            { from: { element: { type: 'presentation' } }, allow: { to: { element: { types: { anyOf: ['presentation', 'application', 'infrastructure', 'domain', 'content'] } } } } },
            { from: { element: { type: 'test' } }, allow: { to: { element: { type: '*' } } } },
          ],
        },
      ],
    },
  },
);
