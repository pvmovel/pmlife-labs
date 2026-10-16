# Spike: documentação de código com TypeDoc (e documentação como gate)

## Problema

Documentação de código costuma morrer de duas formas:

- **ninguém escreve**: o domínio cresce, e as regras ("o nível é derivado do XP", "concluir de novo não soma") ficam só na cabeça de quem escreveu;
- **ela apodrece**: um símbolo é renomeado, o `{@link}` do comentário continua apontando para o nome antigo, e a página gerada mostra um link quebrado sem ninguém perceber.

Gerar documentação a partir do código resolve a primeira parte só se alguém for obrigado a escrever o comentário. A pergunta do spike é: **dá para o CI barrar código público sem documentação e links quebrados, como o ESLint barra imports errados?**

## Solução

```
src/Domain/              entidades e value objects com TSDoc
src/Application/Ports/   portas (interfaces) com TSDoc
typedoc.json             Markdown em docs/code/ (gerado, fora do git) + validação como erro
typedoc.html.json        a mesma documentação em HTML, para a demo (dist/)
violations/              3 casos que precisam ser barrados
scripts/check-docs.mjs   prova os dois sentidos
scripts/build-html.mjs   gera o HTML e põe hash no nome dos assets
```

| Peça | Como funciona |
| :--- | :--- |
| **TSDoc** | Comentários `/** */` com `@param`, `@returns`, `@throws`, `@remarks`, `@example`, `@see` e `{@link}`. É o mesmo padrão que o editor mostra no hover. |
| **TypeDoc + `typedoc-plugin-markdown`** | Lê o TypeScript (tipos de verdade, não só o comentário) e gera uma página Markdown por classe e interface, que pode ser lida direto no GitHub. |
| **Validação como gate** | `validation.notDocumented` + `requiredToBeDocumented` (classes, interfaces, métodos, propriedades, construtores…) e `validation.invalidLink`, com `treatWarningsAsErrors`. Qualquer aviso faz o `typedoc` sair com erro, e o `yarn verify` falha. |
| **Escopo** | Só `Domain` e `Application/Ports`: é o que outro dev (ou outra trilha do produto) precisa entender para usar o núcleo. A UI não entra. |

### O que o `verify` prova

| Caso | Resultado esperado |
| :--- | :--- |
| `src/` inteiro documentado | Markdown gerado para cada entidade, value object e porta, com exemplo, exceções, parâmetros e retornos |
| `violations/UndocumentedExport.ts` | função exportada sem TSDoc ➔ **barrada** |
| `violations/UndocumentedMethod.ts` | classe documentada, mas um método público sem TSDoc ➔ **barrada** |
| `violations/BrokenLink.ts` | `{@link EscadaDeNiveis}` para um símbolo que não existe ➔ **barrada** |

Cada violação precisa gerar **exatamente** o aviso esperado. Se o TypeDoc deixar passar ou reclamar de outra coisa, o script falha.

## Achados

1. **O gate pegou o próprio spike.** A primeira geração falhou com 4 avisos no código "bom": um construtor só com `@param` (sem resumo) e três `{@link}` entre arquivos que o TypeDoc não resolveu.
2. **`{@link}` entre módulos.** O TypeDoc resolve pelo escopo do TypeScript: o link funciona se o símbolo está importado no arquivo. Quando não está, usa-se a referência completa `{@link "Domain/ValueObjects/LevelLadder"!LevelLadder | LevelLadder}`.
3. **Documentação respeita a regra de dependência.** O `ProgressSnapshot` (domínio) citava o `ProgressRepository` (aplicação). Para resolver o link, o domínio teria que importar a aplicação, então o link saiu: quem aponta para o domínio é a porta, nunca o contrário.
4. **Cache dos assets.** O HTML do TypeDoc usa nomes fixos (`assets/main.js`, `style.css`, `icons.svg`…). Atrás de um CDN que segura estáticos por horas, um deploy novo mostraria CSS e JS velhos. O `build-html.mjs` põe o hash do conteúdo no nome de cada asset, reescreve as páginas e falha se sobrar algum nome sem hash.
5. **Versões.** `typedoc@0.28` aceita TypeScript 5.0 a 6.0 e exige Node 18 ou mais novo. O plugin de Markdown 4.x acompanha a 0.28. O `build-html.mjs` usa `readdirSync` recursivo (Node 20+): num Node 16 ele reescrevia só as páginas da raiz, sem erro, então o script agora recusa Node antigo e o `package.json` declara `engines`.
6. **Navegação do labs.** Toda demo do labs tem os botões `← PMLife Labs` e `Documentação` no topo. Como o HTML é do TypeDoc, o build injeta a barra em cada página, com os links relativos ajustados à profundidade (`dist/` ou `dist/classes/`).

## Demo

A demo é a documentação em HTML gerada pelo mesmo comando, com busca e navegação. A versão em Markdown (`docs/code/`) é a que vai para o repositório do produto, e um trecho dela aparece na saída do `verify` abaixo.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify          # tsc + typedoc (Markdown em docs/code/) + 6 páginas conferidas + 3 violações barradas
yarn build           # HTML em dist/ com hash nos assets
```

Para ver o gate em ação, apague o comentário de qualquer método em `src/` e rode `yarn docs:generate`.
