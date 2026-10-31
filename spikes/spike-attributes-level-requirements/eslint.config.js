// Fronteiras da Clean Architecture (mesma técnica do spike-eslint-clean-arch-boundaries): o Domain (progressão,
// escada, versões, fila) é TypeScript puro; o conteúdo (cursos e catálogo) é só dado. O php/ é o espelho do servidor.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/Domain' },
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
            { from: { element: { type: 'test' } }, allow: { to: { element: { type: '*' } } } },
          ],
        },
      ],
    },
  },
);
