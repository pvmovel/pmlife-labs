// Fronteiras: o Domain é TypeScript puro (não importa React, Content nem Presentation).
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
        { type: 'domain', pattern: 'src/Domain' },
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
            { from: { element: { type: 'content' } }, allow: { to: { element: { type: 'content' } } } },
            { from: { element: { type: 'presentation' } }, allow: { to: { element: { types: { anyOf: ['presentation', 'domain', 'content'] } } } } },
            { from: { element: { type: 'test' } }, allow: { to: { element: { type: '*' } } } },
          ],
        },
      ],
    },
  },
);
