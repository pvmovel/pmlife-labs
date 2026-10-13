# Spike: fronteiras da Clean Architecture verificadas pelo ESLint

## Problema

Em Clean Architecture a regra de dependência ("as setas só apontam para dentro") costuma existir só na documentação. Basta um `import` apressado (um caso de uso instanciando o repositório concreto, ou um componente de tela falando direto com o banco) para a arquitetura se desfazer, e o code review nem sempre percebe.

Aliases de import (`@infrastructure/...`) pioram a situação, porque um `grep` por `../Infrastructure` deixa de encontrar a violação.

## Solução

Transformar a matriz de dependências em **regra de lint**, que roda no editor, no pre-commit e no CI, com [`eslint-plugin-boundaries`](https://www.jsboundaries.dev/) e o resolver de TypeScript, para que imports por alias e relativos sejam classificados da mesma forma.

```
src/
├── Domain/                 TypeScript puro (entidades, regras)
├── Application/            casos de uso + Ports (interfaces)
├── Infrastructure/         adaptadores concretos dos Ports
├── Presentation/           UI / CLI
│   └── di/                 Composition Root: único ponto que liga Infrastructure aos casos de uso
└── Content/                dados estáticos (textos, catálogos)
```

### Matriz de imports

| De ↓ / Para ➔ | Domain | Application | Infrastructure | Presentation | Presentation/di | Content |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Domain** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Application** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Infrastructure** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Presentation** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Presentation/di** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Content** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Tudo o que não está liberado é proibido (`default: "disallow"`). Além disso, `boundaries/no-unknown-files` faz falhar qualquer arquivo `.ts` que não pertença a uma camada, para que nada escape da matriz por não estar classificado.

| Arquivo | Papel |
| :--- | :--- |
| `eslint.config.js` | Flat config: camadas (`boundaries/elements`) e matriz (`boundaries/dependencies`). O Composition Root é declarado **antes** da Presentation, porque o primeiro padrão que casa classifica o arquivo. |
| `tsconfig.json` | Aliases `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*` e `@content/*`, lidos também pelo resolver do ESLint. |
| `src/` | Exemplo mínimo e correto: entidade `Task`, Port `TaskRepository`, caso de uso `AddTask`, adaptador `InMemoryTaskRepository`, Composition Root e uma CLI. |
| `violations/` | Um arquivo por violação que **deve** falhar. Fica fora do `yarn lint` normal. |
| `scripts/check-violations.mjs` | Usa a API do ESLint para provar os dois sentidos: `src/` passa sem erros e cada arquivo de `violations/` gera exatamente o erro de fronteira esperado. |

### Exemplo de erro

```ts
// violations/Application/ImportsInfrastructure.ts
import { InMemoryTaskRepository } from '@infrastructure/InMemoryTaskRepository';
```

```
2:40  error  There is no policy allowing dependencies from elements of type "application"
             to elements of type "infrastructure"  boundaries/dependencies
```

O caso de uso deve receber o Port pelo construtor. Quem decide qual implementação usar é o Composition Root (`src/Presentation/di/container.ts`).

## Como testar localmente

Requer Node 20+ e Yarn 1.

```bash
yarn install --frozen-lockfile
yarn verify
```

Saída esperada:

```
✅ src/ sem violações (7 arquivos, 0 erros)
✅ domain ➔ presentation bloqueado (violations/Domain/ImportsPresentation.ts)
✅ domain ➔ infrastructure bloqueado (violations/Domain/ImportsInfrastructureRelative.ts)
✅ application ➔ infrastructure bloqueado (violations/Application/ImportsInfrastructure.ts)
✅ presentation ➔ infrastructure bloqueado (violations/Presentation/ImportsInfrastructure.ts)
✅ infrastructure ➔ presentation bloqueado (violations/Infrastructure/ImportsPresentation.ts)
✅ content ➔ domain bloqueado (violations/Content/ImportsDomain.ts)
```

Para ver uma violação no editor, copie qualquer arquivo de `violations/` para a pasta correspondente em `src/` e rode `yarn lint`.

| Script | O que faz |
| :--- | :--- |
| `yarn lint` | ESLint em `src/` e na config (ignora `violations/`) |
| `yarn typecheck` | `tsc --noEmit` |
| `yarn check:violations` | prova que a config aceita o certo e bloqueia o errado |
| `yarn verify` | os três acima; é o que o CI do labs roda |

## Notas

- `eslint-plugin-boundaries` v7: a opção `mode` dos elementos foi depreciada. O padrão já casa por pasta, e `partialMatch: false` substitui `mode: "full"`.
- `typescript-eslint` 8 aceita TypeScript `< 6.1`. Por isso o spike usa TypeScript 5.9.
- No Yarn 1, `yarn check` é um comando nativo. Por isso o script agregador se chama `verify`.
