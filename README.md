# PMLife Labs 🧪 (Engine 3D & Frontend Showcase)

[![CI](https://github.com/pvmovel/pmlife-labs/actions/workflows/ci.yml/badge.svg)](https://github.com/pvmovel/pmlife-labs/actions/workflows/ci.yml) [![Deploy Labs](https://github.com/pvmovel/pmlife-labs/actions/workflows/deploy-labs.yml/badge.svg)](https://github.com/pvmovel/pmlife-labs/actions/workflows/deploy-labs.yml)

Repositório público de Pesquisa e Desenvolvimento (P&D) da plataforma PMLife: PoCs demonstráveis, spikes técnicos e benchmarks.

Cada item tem um `README.md` explicando o problema, a solução e como testar.

## 🗂️ Onde cada coisa fica

| Pasta | Para quê | Público | Prefixo |
| :--- | :--- | :--- | :--- |
| `pocs/` | **Prova de conceito** de uma rotina ou funcionalidade, algo **demonstrável** a cliente ou investidor (ex.: navegação 3D, diálogo com NPC, progressão de níveis) | negócio | `poc-` |
| `spikes/` | **Investigação técnica** com tempo limitado: testar uma tecnologia nova, comparar alternativas (lib A × lib B), validar uma técnica de arquitetura, segurança ou infra | engenharia | `spike-` |
| `benchmarks/` | **Medição** de desempenho, reproduzível e com números | engenharia | — |

Regra prática: se a pergunta é **"dá para o produto fazer isso?"**, é PoC. Se é **"qual tecnologia ou técnica usar, e ela funciona aqui?"**, é spike.

> Este repositório é **público**. PoCs usam dados fictícios e demonstram a rotina, não o produto: nada de currículo das trilhas, system prompts, base de conhecimento ou textos do ERP. Demonstração com conteúdo real é feita no homolog do produto.

## 🎯 PoCs

| PoC | Tema |
| :--- | :--- |
| [`pocs/poc-domain-driven-gamification-ts`](pocs/poc-domain-driven-gamification-ts) | Motor de gamificação para qualquer trilha: níveis derivados do XP por escada configurável, salto de vários níveis, missões idempotentes e reidratação |
| [`pocs/poc-r3f-data-driven-city`](pocs/poc-r3f-data-driven-city) | Motor 3D orientado a dados: uma cidade por trilha a partir de um JSON, validada no domínio, com sombras, fonte local e carregamento progressivo |
| [`pocs/poc-r3f-third-person-avatar`](pocs/poc-r3f-third-person-avatar) | Avatar em 3ª pessoa com WASD/setas, colisão com prédios e limites do mapa, câmera que persegue e alternância para a visão orbital |
| [`pocs/poc-r3f-proximity-interaction-hud`](pocs/poc-r3f-proximity-interaction-hud) | Aviso ao chegar perto de um prédio, atalhos I/E/H seguros na digitação, modais acessíveis e guia do aluno em Markdown sanitizado |
| [`pocs/poc-r3f-orbital-building-picking`](pocs/poc-r3f-orbital-building-picking) | Modo orbital: clicar ou tocar num prédio o seleciona, com Entrar e Informações por botão ou tecla; arrastar a câmera não seleciona |
| [`pocs/poc-r3f-ai-npc-dialog`](pocs/poc-r3f-ai-npc-dialog) | NPCs 3D com conversa: aviso "E para conversar", memória curta de 3 trocas e lista branca de personas no servidor (`INVALID_PERSONA`) |

## 🧪 Spikes

| Spike | Tema |
| :--- | :--- |
| [`spikes/spike-php-env-security-hostgator`](spikes/spike-php-env-security-hostgator) | Credenciais fora do webroot em hospedagem compartilhada, erros PDO sanitizados e headers de segurança via `.htaccess` |
| [`spikes/spike-eslint-clean-arch-boundaries`](spikes/spike-eslint-clean-arch-boundaries) | Fronteiras da Clean Architecture verificadas pelo ESLint (`eslint-plugin-boundaries`), com prova automática de que cada violação é bloqueada |
| [`spikes/spike-sql-versioned-migrations`](spikes/spike-sql-versioned-migrations) | Migrations SQL versionadas por dialeto (MySQL e PostgreSQL), runner PHP e repositório PDO, com demo ao vivo no banco do labs |
| [`spikes/spike-clean-arch-frontend-ts`](spikes/spike-clean-arch-frontend-ts) | Fatia vertical de Clean Architecture no front (Port, Adapter, caso de uso, Composition Root, hook e componente) |
| [`spikes/spike-i18n-type-safe-react`](spikes/spike-i18n-type-safe-react) | i18n tipado em React sem biblioteca: chaves checadas em compilação, namespaces por arquivo, paridade entre idiomas e `<html lang>` sincronizado |
| [`spikes/spike-typedoc-code-documentation`](spikes/spike-typedoc-code-documentation) | Documentação de código gerada pelo TypeDoc a partir do TSDoc, como gate: export sem documentação ou `{@link}` quebrado falha o CI |
| [`spikes/spike-sqlite-wasm-browser-persistence`](spikes/spike-sqlite-wasm-browser-persistence) | SQLite WASM num Web Worker gravando no OPFS (VFS `opfs-sahpool`, sem COOP/COEP), schema local versionado e persistência provada no Chrome headless |
| [`spikes/spike-zero-cost-ai-gateway`](spikes/spike-zero-cost-ai-gateway) | Gateway de IA a custo zero em PHP (Gemini ➔ Groq, system prompt no servidor, limite por IP e teto global) + RAG lexical BM25 em TypeScript |

## 📊 Benchmarks

- [`benchmarks/sqlite-wasm`](benchmarks/sqlite-wasm): abertura, gravação e leitura do SQLite WASM com OPFS no navegador (abertura ~140 ms, gravação avulsa ~3,5 ms).

## 🚀 CI/CD e demos ao vivo

Todo push na `main` passa pelos gates do [`ci.yml`](.github/workflows/ci.yml) (gitleaks, checagem de termos proibidos, `php -l`, `yarn verify` de cada item, montagem da página de portfólio) e é publicado automaticamente pelo [`deploy-labs.yml`](.github/workflows/deploy-labs.yml) via FTPS, com smoke test ao final. PRs e outras branches rodam só os gates.

Convenção para cada `pocs/<nome>/`, `spikes/<nome>/` ou `benchmarks/<nome>/`. **Todo item precisa de `README.md` e `labs.json`; sem eles o build falha**, para que nada criado no labs fique fora da página de portfólio:

| Pasta / arquivo | O que acontece no deploy |
| :--- | :--- |
| `README.md` | documentação completa, renderizada na página de detalhe do item |
| `labs.json` | dados do card e do cabeçalho da página (ver abaixo) |
| `public/` | webroot da demo (PHP ou HTML), acessível publicamente. **Toda demo em HTML tem, no topo, os botões `← PMLife Labs` (página principal) e `Documentação` (página do item no catálogo)** |
| `package.json` com script `verify` | o build roda `yarn verify`, publica a saída na página do item e falha o pipeline se der erro |
| `package.json` com script `build` | o build roda `yarn build --base=<base>/<grupo>/<nome>/dist/` e publica `dist/` |
| qualquer outra pasta (`src/`, `config/`…) | vai para o servidor, porque os `require` relativos precisam dela, mas responde **403** |

### `labs.json`

```json
{
  "title": "Título curto, em linguagem de quem vai ler o portfólio",
  "summary": "Uma ou duas frases: o que é e por que importa.",
  "problem": "Qual problema motivou o experimento.",
  "result": "O que ficou provado (ou descartado).",
  "tags": ["Tecnologia", "Técnica"],
  "roadmap": "US15",
  "date": "AAAA-MM-DD",
  "demo": { "path": "public/index.html", "label": "Abrir a demo", "note": "O que esperar da demo (opcional)" },
  "run": "comandos para rodar localmente,\num por linha"
}
```

`roadmap`, `demo` e `run` são opcionais. Sem `demo`, o build usa o `index` de `public/` ou `dist/`, se existir.

## 🗄️ Banco do labs

As demos ao vivo usam um **MySQL real** na hospedagem, sem custo extra (incluído no plano):

- um banco isolado, sem acesso aos bancos do produto;
- **dois usuários:** *app* (só `SELECT, INSERT, UPDATE, DELETE`), usado pelas páginas, e *admin* (DDL), usado **só** pelo Cron, que roda `migrate.php up` uma vez por dia;
- **credenciais fora do webroot e fora deste repositório:** `labs.production.env.php` (app) e `labs.admin.env.php` (admin), com permissão 600, localizados pela técnica do [`spike-php-env-security-hostgator`](spikes/spike-php-env-security-hostgator);
- `error_log` e arquivos internos de cada item respondem 403.

### Cache

O `site/.htaccess` e o gerador garantem que **nenhum visitante veja versão antiga** depois de um deploy:
- HTML, saída do CI e JSON vão com `Cache-Control: no-cache` (o Cloudflare na frente do domínio não altera HTML);
- **todo CSS/JS tem hash no nome** (`assets/labs.<hash>.css`, `dist/assets/` das demos) e fica 1 ano em cache (`immutable`). Isso é obrigatório porque o Cloudflare reescreve o cache de arquivos estáticos para no mínimo 4h: um `labs.css` sem hash ficaria velho por horas.

O smoke test do deploy confere esses cabeçalhos. Toda demo nova deve gerar assets com hash (build do Vite) ou servir HTML/JSON sem cache.

Convenções:

- um item com **schema próprio** ganha banco próprio, sem dividir tabelas entre spikes;
- demos com **escrita** só entram com reset diário pelo Cron e limite de volume;
- só MySQL ao vivo (a hospedagem não oferece PostgreSQL); os testes automatizados continuam nos bancos descartáveis do CI.

## 🖥️ Página de portfólio

A página publicada em `/labs` (home com todos os itens e uma página de detalhe por item, com código, demo, execução no CI e como rodar) é gerada por [`site/build.mjs`](site/build.mjs), chamado por [`scripts/build-site.sh`](scripts/build-site.sh). Para testar localmente (Node 20+ e Yarn 1):

```bash
bash scripts/build-site.sh
cd _site && python3 -m http.server 8000   # abrir http://localhost:8000
```
