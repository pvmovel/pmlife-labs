# Spike: documentação técnica interativa com Astro Starlight num subcaminho

## Problema

Um produto que quer investidores, parceiros e recrutadores precisa de uma documentação técnica pública. Ela tem que ser bonita e navegável, e tem que dizer a verdade sobre o código. Na prática:

- **Precisa acompanhar o código.** Uma documentação escrita à parte envelhece em semanas. O ideal é gerar no build o que vem do repositório: o mapa de pastas e arquivos, os números e as camadas.
- **Não pode expor o que é interno.** O mapa do repositório cita caminhos do servidor, arquivos de ambiente e credenciais de exemplo; o site é público.
- **Mora num subcaminho da hospedagem compartilhada** (no produto, `/architecture/`), ao lado da aplicação, sem servidor Node e com custo zero.
- **Dois idiomas**, com busca.
- **Não pode servir versão velha.** O domínio passa pela Cloudflare, que guarda JS e CSS por pelo menos 4 h. Todo arquivo estático precisa de hash no nome, e a busca tem arquivos sem hash.

## Solução

- **[Astro Starlight](https://starlight.astro.build/):** documentação estática com menu, modo escuro, i18n e busca (Pagefind) prontos.
- **Componentes interativos em React** (ilhas que só carregam JS onde são usadas):
  - **Explorador de arquivos:** a árvore do repositório e, para cada arquivo, a função, o que expõe, quem usa, de onde veio e a conformidade. "Usado por" navega entre os arquivos, e o filtro acha pelo nome ou pela função.
  - **Diagrama das camadas:** clicar numa camada mostra o que ela contém e o que pode (verde) e não pode (riscado) importar. É a mesma matriz que o ESLint aplica no produto.
  - **Siga uma funcionalidade:** um caso de uso atravessando as camadas, passo a passo, por botões ou pelas setas.
  - **Números do projeto:** calculados no build a partir do mapa; é HTML pronto, sem JS.
- **O mapa do repositório vira dado no build** ([`structureMap.ts`](src/lib/structureMap.ts)). O formato é o mesmo do mapa do produto: um bloco `#### caminho` por arquivo, com uma linha `EN:` opcional para o inglês. A lógica é TypeScript puro, testada com Vitest.
- **Sanitização com falha fechada** ([`sanitize.ts`](src/data/sanitize.ts)):
  - as regras trocam o detalhe interno por um texto genérico no idioma da descrição (`[arquivo de ambiente]` / `[environment file]`);
  - depois, uma lista de termos proibidos é conferida, e **o build falha** se algum escapar;
  - o e2e ainda varre todos os arquivos de texto do site gerado.

O mapa deste spike é de um **projeto fictício** (a "Horta Escolar"), com termos sensíveis colocados de propósito para provar a sanitização.

## Cache: nenhuma versão velha, inclusive na busca

| Arquivo | Nome | Cache |
| :--- | :--- | :--- |
| Páginas (`.html`) | sem hash | `no-cache` (a Cloudflare não mexe em HTML) |
| JS e CSS do site | `assets/<nome>.<hash>.js` (`build.assets: 'assets'`) | `immutable`, pela regra de `dist/assets/` do labs |
| Índice da busca (`pagefind-entry.json`) | sem hash | `no-cache` (é JSON) |
| Pedaços do índice (`.pf_meta`, `.pf_index`, `.pf_fragment`) | com hash | `immutable` ([`public/.htaccess`](public/.htaccess)) |
| `pagefind.js`, `pagefind-worker.js`, `wasm.<idioma>.pagefind` | sem hash | `no-cache` na origem; a Cloudflare pode guardar o JS por 4 h |

O achado que fecha o problema: o Starlight embute a interface da busca nos próprios assets, que têm hash. Em tempo de execução, a busca só baixa 4 arquivos sem hash. O e2e faz **dois builds com conteúdo diferente** e prova que esses 4 **não mudam**: só o JSON de entrada muda, e JSON vai com `no-cache`. Eles só mudam quando a versão do Pagefind muda. Para esse caso, o smoke do deploy confere que a versão do `pagefind.js` no ar é igual à do `pagefind-entry.json`. Se a Cloudflare servir um `pagefind.js` velho, o deploy fica vermelho.

## O que o `verify` prova

1. **Tipos:** `astro check` (páginas e componentes) e `tsc` (lógica e testes).
2. **Vitest (18 testes):**
   - leitura do mapa: função, inglês, exports, quem usa, origem, conformidade;
   - títulos de seção que não viram arquivo;
   - a camada de cada caminho;
   - a árvore (pastas primeiro);
   - o mapa cru é **pego** pela trava de vazamento, e depois das regras não sobra nada;
   - o caminho e os exports não mudam;
   - os números.
3. **e2e no Chrome headless**, com um build de verdade no subcaminho `/sub/docs/`:
   - nada sensível nos arquivos de texto gerados e nenhum código-fonte publicado;
   - a mesma página em português e em inglês, pelo seletor;
   - os números vêm do mapa;
   - a busca acha páginas do idioma certo, dentro do subcaminho;
   - o diagrama, o explorador (detalhe, "Usado por", filtro, versão em inglês) e o passo a passo respondem ao clique;
   - o cache: todo JS/CSS em `assets/` com hash, os arquivos da busca estáveis entre builds, a versão do Pagefind coerente;
   - nenhum erro na página, nenhum arquivo faltando, nenhuma requisição a outra origem (a fonte e os ícones são locais).

## Como rodar

```bash
yarn install --frozen-lockfile
yarn verify    # astro check + tsc + 18 testes + e2e no Chrome headless
yarn dev       # http://localhost:4321
```

> O Yarn 1 não instala dependências *peer*. Sem `@emnapi/core` e `@emnapi/runtime` declarados, o `astro check` não carrega e **sai com sucesso sem checar nada**. Por isso os dois estão no `package.json`.

## Estrutura

```text
src/
├── lib/structureMap.ts       mapa ➔ entradas, camadas, árvore, números; sanitização e trava (TS puro)
├── data/
│   ├── repo.ts               no BUILD: lê o mapa, sanitiza, confere vazamentos, monta árvore e números
│   ├── sanitize.ts           regras de troca (por idioma) e termos proibidos
│   └── architecture.ts       textos dos componentes, camadas e passos, nos dois idiomas
├── components/               FileExplorer, LayerDiagram, FeatureWalkthrough (React) e LiveNumbers (Astro)
└── content/docs/             páginas em MDX: português na raiz, inglês em en/
fixtures/ESTRUTURA.md         mapa do projeto fictício (com termos sensíveis de propósito)
public/.htaccess              cache dos arquivos da busca
tests/structureMap.spec.ts    Vitest
scripts/e2e.mjs               e2e no Chrome headless
```

## Sanitização

- O conteúdo é de um projeto fictício.
- Os termos sensíveis do mapa são inventados e existem para provar a trava.
- Nenhuma credencial, nenhum domínio e nenhum caminho real.
