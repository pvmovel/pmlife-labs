# Spike: SQLite WASM no navegador (OPFS, Web Worker e schema versionado)

## Problema

Um app educacional em que o aluno ganha XP e conclui missões precisa guardar esse progresso. Sem um backend com contas (e sem custo de infraestrutura), o progresso tem que ficar **no navegador**, e as opções comuns têm limites:

- `localStorage`: síncrono (trava a página), poucos MB, só strings;
- IndexedDB: resolve o espaço, mas sem SQL, sem transações relacionais e com uma API que vira código de infraestrutura espalhado.

A pergunta do spike: **dá para usar SQLite de verdade no navegador, persistente, sem travar a interface e sem exigir headers especiais do servidor?**

## Solução

```
src/
├── Domain/ProgressSnapshot.ts            o que se grava (trilha, XP, missões)
├── Application/Ports/ProgressRepository  load / save: a página só conhece isto
├── Infrastructure/
│   ├── sqlite.worker.ts                  SQLite WASM num Web Worker, VFS opfs-sahpool
│   ├── localSchema.ts                    migrations locais + tabela schema_migrations
│   ├── SqlProgressStore.ts               SQL do progresso (upsert numa transação)
│   ├── WorkerProgressRepository.ts       adapter: Port -> mensagens para o Worker
│   ├── InMemoryProgressRepository.ts     fallback sem OPFS (e repositório dos testes)
│   └── createProgressRepository.ts       escolhe OPFS ou memória (no produto: Composition Root)
└── Presentation/main.ts                  demo
tests/                                    schema e SQL no Node (SQLite em memória)
scripts/e2e.mjs                           persistência real no Chrome headless
```

| Peça | Como funciona |
| :--- | :--- |
| **`@sqlite.org/sqlite-wasm`** | O SQLite oficial compilado para WebAssembly. O `.wasm` (869 KB; 407 KB com gzip) sai do build do Vite com hash no nome. |
| **Web Worker** | O banco roda fora da thread da interface: gravar não trava animação nem a cena 3D. A página conversa com ele por mensagens com `id` (uma Promise por chamada). |
| **VFS `opfs-sahpool`** | Grava no OPFS (*Origin Private File System*, o disco privado do site no navegador). Ao contrário do VFS OPFS padrão, **não exige `SharedArrayBuffer`**, e portanto dispensa os headers COOP/COEP, que bloqueariam fontes, imagens e scripts de outra origem. |
| **Schema versionado** | Tabela `schema_migrations` (a mesma ideia das migrations do servidor). Ao abrir, só as migrations novas rodam, cada uma na sua transação; se uma falhar, nada dela fica e a versão não é registrada. |
| **Fallback** | Sem OPFS, o mesmo Port é atendido em memória, e a página avisa que o progresso não será salvo. |

### O que o `verify` prova

**No Node** (10 testes, SQLite em memória, porque no Node o pacote só suporta memória):

| Teste | Prova |
| :--- | :--- |
| `localSchema.spec.ts` | banco vazio recebe todas as migrations em ordem; reabrir não reaplica; banco numa versão antiga recebe só o que falta e **mantém os dados**; migration com erro é desfeita e não registrada |
| `SqlProgressStore.spec.ts` | gravar e ler o mesmo snapshot; upsert sem misturar trilhas; gravação inválida não deixa nada pela metade; `InMemory` cumpre o mesmo Port |

**No Chrome headless** (`scripts/e2e.mjs`, build de produção servido localmente, sem COOP/COEP):

1. primeira visita: OPFS ativo, schema migrado do zero, progresso vazio;
2. concluir duas missões e **recarregar**: XP e missões voltam do banco, sem migrar de novo;
3. **fechar o navegador e abrir de novo** (mesmo perfil): o progresso continua;
4. segunda aba com a primeira aberta: registra o comportamento (ver Achados);
5. sem OPFS (simulado): cai para memória e mostra o aviso;
6. apagar dados; e mede o desempenho (os números aparecem na saída abaixo).

## Achados

1. **Funciona sem COOP/COEP.** O e2e serve o build sem nenhum header especial, e o `opfs-sahpool` abre, grava e persiste. Isso confirma a escolha do VFS: o produto pode continuar carregando recursos de outra origem.
2. **Uma aba por vez.** O `opfs-sahpool` segura os arquivos com exclusividade. Com o app aberto numa aba, uma segunda aba recebe `Access Handles cannot be created if there is another open Access Handle` e cai para memória. No produto, isso precisa de tratamento explícito: reconhecer esse erro e avisar "aberto em outra aba" em vez de "navegador sem suporte", ou liberar o pool quando a aba fica oculta (`pauseVfs()` / `unpauseVfs()`, disponíveis na API).
3. **Desempenho folgado.** Abrir o banco (WASM + VFS + migrations) leva cerca de 140 ms, uma vez por carregamento e fora da thread da interface. Uma gravação avulsa ("concluir missão") leva poucos milissegundos.
4. **MIME do `.wasm`.** O navegador só compila em streaming se o servidor mandar `Content-Type: application/wasm`. O `.htaccess` do labs passou a declarar o tipo, e o smoke test do deploy confere.
5. **Arquivos a mais no build.** O pacote referencia por `new URL()` dois scripts que esta configuração não usa (`sqlite3-worker1` e `sqlite3-opfs-async-proxy`, cerca de 245 KB). O Vite os publica com hash, mas o navegador nunca os baixa.
6. **Testar em dois níveis.** No Node, o pacote só roda em memória: SQL e migrations são testados ali, rápido. A persistência real só existe no navegador, e por isso o e2e usa o Chrome que já vem nos runners do GitHub (`puppeteer-core`, sem baixar outro navegador).
7. **"Sem OPFS" é simulado.** Não há como desligar o OPFS no Chrome; a demo usa `?sem-opfs` para exercitar o mesmo caminho do fallback. Uma segunda aba (achado 2) é o caso real mais comum.

## Demo

Conclua missões, recarregue a página ou feche e abra a aba: o XP continua lá. O botão **Medir** roda o benchmark no seu navegador. Abra a demo em duas abas para ver o achado 2.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # tsc + 10 testes no Node + e2e no Chrome headless (precisa de Chrome; CHROME_PATH se não estiver em /usr/bin)
yarn dev      # demo em http://localhost:5173
```
