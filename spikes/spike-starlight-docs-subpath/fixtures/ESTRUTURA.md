# Mapa do repositório (projeto fictício: Horta Escolar)

Mesmo formato do mapa do produto: um bloco `#### caminho` por arquivo. Os termos sensíveis abaixo existem DE PROPÓSITO,
para provar que a sanitização os remove antes de publicar (e que o build falha se algum escapar).

## Raiz

#### `package.json`

Dependências e scripts do projeto (React, Vite, Vitest).

- **EN:** Project dependencies and scripts (React, Vite, Vitest).
- **Criado em:** `a1b2c3d` (2026-01-05) feat(setup): projeto inicial (#1)
- **Conformidade:** ✅ sem achados

#### `vite.config.ts`

Build do front e cópia da lib PHP para a pasta publicada.

- **EN:** Front-end build and copy of the PHP library to the published folder.
- **Criado em:** `a1b2c3d` (2026-01-05) feat(setup): projeto inicial (#1)
- **Conformidade:** ✅ sem achados

## `src/Domain/`

#### `src/Domain/Entities/Canteiro.ts`

Entidade do canteiro: o que está plantado, desde quando e quando colher.

- **EN:** Garden bed entity: what is planted, since when and when to harvest.
- **Expõe:** `Canteiro`, `CanteiroSnapshot`
- **Usado por:** `src/Application/UseCases/RegistrarColheitaUseCase.ts`, `src/tests/Domain/Canteiro.spec.ts`
- **Criado em:** `b2c3d4e` (2026-01-10) feat(domain): canteiros e plantio (#3)
- **Conformidade:** ✅ sem achados

#### `src/Domain/ValueObjects/Colheita.ts`

Uma colheita: a cultura, o peso em gramas e a data. Recusa peso negativo.

- **EN:** A harvest: the crop, the weight in grams and the date. Rejects negative weight.
- **Expõe:** `Colheita`, `ColheitaInvalidaError`
- **Usado por:** `src/Domain/Entities/Canteiro.ts`, `src/Application/UseCases/RegistrarColheitaUseCase.ts`
- **Criado em:** `b2c3d4e` (2026-01-10) feat(domain): canteiros e plantio (#3)
- **Conformidade:** ✅ sem achados

#### `src/Domain/Services/Calendario.ts`

Calcula a data prevista de colheita a partir da cultura e do plantio.

- **EN:** Computes the expected harvest date from the crop and the planting date.
- **Expõe:** `dataPrevistaDeColheita`
- **Usado por:** `src/Domain/Entities/Canteiro.ts`
- **Criado em:** `c3d4e5f` (2026-01-12) feat(domain): calendário de colheita (#4)
- **Conformidade:** ✅ sem achados

## `src/Application/`

#### `src/Application/Ports/CanteiroRepository.ts`

Port: carregar e gravar canteiros, sem saber onde eles ficam.

- **EN:** Port: load and save garden beds, without knowing where they live.
- **Expõe:** `CanteiroRepository`
- **Usado por:** `src/Application/UseCases/RegistrarColheitaUseCase.ts`, `src/Infrastructure/Adapters/HttpCanteiroRepository.ts`
- **Criado em:** `d4e5f6a` (2026-01-15) feat(app): registrar colheita (#5)
- **Conformidade:** ✅ sem achados

#### `src/Application/UseCases/RegistrarColheitaUseCase.ts`

Caso de uso: registra a colheita no canteiro e grava pelo Port.

- **EN:** Use case: records the harvest on the garden bed and saves it through the Port.
- **Expõe:** `RegistrarColheitaUseCase`
- **Usado por:** `src/Presentation/di/Dependencias.tsx`, `src/tests/Application/RegistrarColheita.spec.ts`
- **Criado em:** `d4e5f6a` (2026-01-15) feat(app): registrar colheita (#5)
- **Conformidade:** ✅ sem achados

## `src/Infrastructure/`

#### `src/Infrastructure/Adapters/HttpCanteiroRepository.ts`

Adapter do Port sobre a API PHP (`GET/POST /api/canteiros.php`), com teste de contrato.

- **EN:** Port adapter over the PHP API (`GET/POST /api/canteiros.php`), with a contract test.
- **Expõe:** `HttpCanteiroRepository`
- **Usado por:** `src/Presentation/di/Dependencias.tsx`
- **Criado em:** `e5f6a7b` (2026-01-18) feat(api): canteiros na api (#6)
- **Conformidade:** ⚠️ F1 (Média)

## `src/Presentation/`

#### `src/Presentation/di/Dependencias.tsx`

Composition Root: o único ponto que instancia adapters e monta os casos de uso.

- **EN:** Composition Root: the only place that instantiates adapters and builds the use cases.
- **Expõe:** `DependenciasProvider`, `useDependencias`
- **Usado por:** `src/Presentation/app.tsx`
- **Criado em:** `d4e5f6a` (2026-01-15) feat(app): registrar colheita (#5)
- **Conformidade:** ✅ sem achados

#### `src/Presentation/app.tsx`

Ponto de entrada da página: monta as dependências e a tela da horta.

- **EN:** Page entry point: mounts the dependencies and the garden screen.
- **Usado por:** `index.html`
- **Criado em:** `a1b2c3d` (2026-01-05) feat(setup): projeto inicial (#1)
- **Conformidade:** ✅ sem achados

#### `src/Presentation/Components/PainelDaHorta.tsx`

Tela com os canteiros e o botão "Registrar colheita".

- **EN:** Screen with the garden beds and the "Record harvest" button.
- **Expõe:** `PainelDaHorta`
- **Usado por:** `src/Presentation/app.tsx`
- **Criado em:** `d4e5f6a` (2026-01-15) feat(app): registrar colheita (#5)
- **Conformidade:** ✅ sem achados

## `src/Content/`

#### `src/Content/culturas.json`

As culturas da horta (alface, tomate, abóbora) e o tempo até a colheita, em dias.

- **EN:** The garden crops (lettuce, tomato, pumpkin) and the days until harvest.
- **Usado por:** `src/Domain/Services/Calendario.ts`
- **Criado em:** `c3d4e5f` (2026-01-12) feat(domain): calendário de colheita (#4)

## `backend/`

#### `backend/api/canteiros.php`

Endpoint fino: valida o pedido, chama o repositório e responde no envelope do contrato. Carrega o arquivo `~/horta.prod.env.php` fora do webroot `/home/fulano/public_html`.

- **EN:** Thin endpoint: validates the request, calls the repository and answers in the contract envelope. Loads the `~/horta.prod.env.php` file outside the `/home/fulano/public_html` webroot.
- **Criado em:** `e5f6a7b` (2026-01-18) feat(api): canteiros na api (#6)
- **Conformidade:** ✅ sem achados

#### `backend/src/CanteiroRepository.php`

Repository PDO dos canteiros; DSN vindo do env (`DB_PASS=troque-me` só no exemplo).

- **EN:** PDO repository for garden beds; DSN from the env (`DB_PASS=change-me` only in the example).
- **Criado em:** `e5f6a7b` (2026-01-18) feat(api): canteiros na api (#6)
- **Conformidade:** ✅ sem achados

## `src/tests/`

#### `src/tests/Domain/Canteiro.spec.ts`

Plantio, colheita e as recusas do canteiro.

- **EN:** Planting, harvest and the garden bed rejections.
- **Criado em:** `b2c3d4e` (2026-01-10) feat(domain): canteiros e plantio (#3)

#### `src/tests/Application/RegistrarColheita.spec.ts`

O caso de uso com um repositório falso.

- **EN:** The use case with a fake repository.
- **Criado em:** `d4e5f6a` (2026-01-15) feat(app): registrar colheita (#5)
