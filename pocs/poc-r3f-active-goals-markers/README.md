# PoC: objetivos ativos no campus

## O que esta PoC mostra

Uma fase de um curso fictício, com três prédios. O **autor sugere metas**, cada uma ligada a missões da fase; o **aluno fixa** as que quer seguir, e o campus mostra o caminho:

| No campus | O que acontece |
| :--- | :--- |
| **G** (ou o botão **Metas**) | abre as metas da fase, na mesma lista pelo teclado dos portais: o número da meta (1 a 9 e 0) ou Enter fixa e desafixa |
| uma meta fixada | o painel no canto mostra **"0 de 2"** e os prédios que faltam; cada prédio com missão pendente da meta ganha um **marcador 3D** |
| perto de um prédio, **E** (ou **Fazer missão**) | a missão daquele prédio é concluída (na demo, na hora) |
| uma missão concluída | **"1 de 2"**, e o marcador daquele prédio some |
| todas as missões da meta | a meta aparece **cumprida**, e nenhum marcador fica |
| a fase **sem metas do autor** | o painel sugere a **próxima missão aberta**, e o prédio dela ganha o marcador |
| **Marcadores no 3D** desligado | as metas continuam no painel, sem nada desenhado na cena |

As metas fixadas ficam no aparelho: continuam lá depois de recarregar a página. O progresso da demo fica só na memória (**Recomeçar a fase** zera). O curso, as missões e os prédios são inventados.

## Como funciona

```text
src/
├── Content/phases.json            a cidade (3 prédios) e as fases: missões e as metas do autor (a Fase 2 não tem)
├── Content/goal-cases.json        7 casos de conformidade da validação das metas (os mesmos que o PHP do produto vai rodar)
├── Domain/                        TypeScript puro
│   ├── Goals.ts                   a regra: progresso da meta, próxima missão aberta, metas fixadas, prédios marcados, validação
│   └── PhaseDocument.ts           o documento conferido ao abrir a página (missão em prédio inexistente, id repetido, metas)
└── Presentation/
    ├── Engine3D/CampusCanvas.tsx  o campus (React.lazy): prédios, avatar, proximidade e os marcadores
    ├── Engine3D/GoalMarker.tsx    o marcador: um sprite com uma textura desenhada uma vez num canvas
    ├── HUD/GoalsHud.tsx           o painel das metas fixadas (ou da sugestão)
    ├── HUD/GoalsPanel.tsx         a janela das metas, com a lista pelo teclado (KeyboardList)
    └── pinStore.ts                as metas fixadas no aparelho (no produto, o SQLite WASM)
```

| Técnica | Por quê |
| :--- | :--- |
| **A meta é derivada do progresso** | O estado da meta (aberta, em andamento, cumprida) vem só das missões concluídas, que já são o progresso do aluno. Nada é gravado em dobro, e a meta nunca sai de sincronia com as missões. |
| **O autor sugere, o aluno escolhe** | As metas vêm do documento da fase; o aluno fixa uma ou mais. Só essa escolha é guardada, e só no aparelho. Uma meta que o autor removeu some das fixadas sozinha. |
| **Validação no documento** | Meta sem missão, com missão inexistente ou repetida, id repetido ou mais de 10 metas: o documento é recusado com um código estável. Os casos ficam num JSON, para o validador PHP do produto seguir a mesma lista. |
| **Até 10 metas** | Cabem numa página da lista pelo teclado (teclas 1 a 9 e 0). |
| **Marcador leve** | Um sprite por prédio, sem sombra e sem modelo nem imagem baixada. A textura (um losango âmbar com uma seta) é desenhada uma vez num canvas e todos os marcadores usam o mesmo material. Ele fica sempre de frente para a câmera, por cima dos prédios, e sobe e desce devagar. |
| **Uma missão em duas metas** | Duas metas podem dividir uma missão: concluí-la avança as duas, e o prédio é marcado uma vez só. |

### Testes

**No Node** (`yarn test`):

- **o domínio:**
  - os 3 cenários do Gherkin;
  - o estado da meta, a missão dividida entre duas metas, fixar e desafixar, as fixadas que o autor removeu;
  - a próxima missão aberta e a fase concluída;
  - os 7 casos de conformidade da validação;
  - o documento com missão inexistente, prédio inexistente e id repetido, e todos os textos nos dois idiomas;
- **a tela, com os cenários do Gherkin:** G e a tecla da meta, o foco na lista, "0 de 2" e os prédios marcados, E perto do prédio, a meta cumprida sem marcadores, a sugestão sem metas, desafixar, as fixadas depois de recarregar, os marcadores desligados, a janela aberta que trava o E e o inglês;
- **o grafo 3D** (sem WebGL): o sprite sem sombra, sem teste de profundidade, com o mesmo material para todos, flutuando acima do prédio.

**No Chrome headless** (`yarn e2e`), com o build de verdade:

- G e 1 fixam a meta, e a **cena** desenha os 2 marcadores (lidos do grafo do three.js, não do HUD);
- o avatar anda pelo teclado até a Oficina e até o Laboratório, E conclui cada missão, e os marcadores somem um a um;
- os marcadores desligam e religam; as metas fixadas continuam depois de recarregar;
- a fase sem metas sugere a próxima missão e marca o prédio dela;
- no celular de 390 px: Metas e o toque na meta, o painel sem cobrir o joystick, e nada passa da largura;
- nenhum erro e nenhuma requisição a outra origem.

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e
yarn dev      # demo em http://localhost:5173
```

## Limites

- **Na demo, a tecla E conclui a missão na hora.** No produto, a missão é feita na estação da sala do prédio, e o progresso vem do servidor.
- **A sugestão sem metas marca o prédio.** O Gherkin pede só a sugestão no HUD; o marcador também aparece, para mostrar o caminho (dá para desligar nas opções).
- **No produto:**
  - as metas entram no documento do curso (`goals` em cada fase), nos dois validadores, com os casos deste JSON;
  - o autor escreve as metas no editor do curso;
  - as metas fixadas ficam no SQLite WASM do aparelho;
  - o painel usa o `KeyboardList` que os portais já usam.
