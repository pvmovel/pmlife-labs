# PoC: boas-vindas do visitante e modo Avatar 100% teclado

## O que esta PoC mostra

A sede de uma instituição de exemplo, com três prédios. Na **primeira visita**, uma janela de boas-vindas mostra as teclas. No **modo Avatar**, tudo funciona **só pelo teclado**, e o mouse e o toque continuam valendo:

| Tecla | O que faz |
| :--- | :--- |
| **W A S D** ou **setas** | andam e giram o avatar |
| **E** | entra no prédio à frente (na demo, só avisa) |
| **I** | mostra as informações do lugar |
| **M** | troca entre Avatar e Orbital (de *mode*; antes era C) |
| **C** | abre o Co-Pilot, com o foco na pergunta |
| **T** | abre o chat da turma, com o foco no campo da mensagem |
| **H** | abre a ajuda a qualquer momento |
| **Esc** | fecha a janela aberta (o foco volta para a cena) |

A boas-vindas abre sozinha **só na primeira visita**. Fechada, ela não volta; o **H** mostra a mesma lista quando quiser. A escolha fica no aparelho (localStorage).

No celular, a boas-vindas fala do joystick e dos botões, sem teclas. O chat, os colegas e as respostas do Co-Pilot são inventados.

## Como funciona

```text
src/
├── Content/shortcuts.json         a LISTA ÚNICA dos atalhos: tecla, grupo e texto de cada ação
├── Content/copilot.json           as respostas prontas do Co-Pilot da demo, por palavra-chave
├── Content/campus.json            a sede (3 prédios)
├── Domain/                        TypeScript puro
│   ├── Shortcuts.ts               a lista conferida, a tecla ➔ ação e a trava (missingShortcuts)
│   ├── Welcome.ts                 quando a boas-vindas abre sozinha (1ª visita, nova versão)
│   └── Copilot.ts                 a resposta por palavra-chave, sem acento nem maiúscula
└── Presentation/
    ├── hooks/useShortcuts.ts      liga a lista ao teclado (desligado com uma janela aberta)
    ├── HUD/HudButton.tsx          todo botão do HUD: lê a tecla da lista, mostra o <kbd> e o aria-keyshortcuts
    ├── HUD/ShortcutsGuide.tsx     a boas-vindas e a ajuda (a mesma tela, lida da lista)
    ├── HUD/ChatPanel.tsx          o chat (T) e o Co-Pilot (CopilotPanel.tsx, C)
    ├── HUD/ModeToggle.tsx         Avatar ⇄ Orbital (M), com a dica que cita o M
    └── Engine3D/CampusCanvas.tsx  a sede (React.lazy), com a câmera em 3ª pessoa ou orbital
```

| Técnica | Por quê |
| :--- | :--- |
| **Uma lista só** | O teclado, os botões do HUD, a boas-vindas e a ajuda leem o mesmo `shortcuts.json`. Uma tecla nunca aparece numa tela e falta na outra, e trocar uma tecla é mudar uma linha. |
| **A lista é conferida** | Tecla repetida (duas ações na mesma letra), tecla reservada (WASD e setas andam; Esc, Tab e Enter são das janelas) ou que não é letra: a página não abre, e o erro diz o atalho. |
| **Nada dispara enquanto se digita** | Num campo de texto, "t", "c", "m" e "h" são só texto. Com Ctrl, Cmd ou Alt, a tecla é do navegador (Ctrl+C copia, Ctrl+T abre aba). Segurar a tecla não repete a ação. |
| **O foco vai para onde se escreve** | O chat abre no campo da mensagem, o Co-Pilot na pergunta e a boas-vindas no "Começar". O foco fica preso na janela (Tab circula), e o Esc fecha e devolve o foco. A letra que abriu o chat não vira texto. |
| **A trava** | Todo botão do HUD nasce do `HudButton`, com `data-hud-action`. O teste da tela lê todos os botões do HUD e falha apontando o que não tem tecla ou não aparece na ajuda: uma ação nova sem tecla barra o PR. |
| **A boas-vindas tem versão** | Quem já viu não vê de novo, a não ser que o que ela ensina mude (uma tecla nova): aí ela abre uma vez. |

### Testes

**No Node** (`yarn test`, 37 testes):

- **o domínio:**
  - as teclas decididas (M, C, T, E, I, H);
  - WASD e setas sem ação;
  - nada com digitação, Ctrl, Cmd, Alt ou tecla segurada;
  - a lista recusando tecla repetida, reservada ou que não é letra, id repetido e grupo desconhecido;
  - a trava apontando a ação sem tecla;
  - a versão da boas-vindas;
  - o Co-Pilot por palavra-chave.
- **a tela, com os 4 cenários do Gherkin:**
  - a boas-vindas na 1ª visita, Esc sem voltar e o H;
  - T e o foco no campo, Esc e C;
  - M e a dica;
  - a trava sobre os botões de verdade.
  - E também: as teclas paradas com uma janela aberta, "t c m h" como texto no chat, Ctrl+C e Cmd+T do navegador, o C sem trocar o modo, o clique ainda valendo, E e I perto do prédio e o inglês.

**No Chrome headless** (`yarn e2e`), com o build de verdade e **nenhum clique** no computador:

- a boas-vindas com o foco no "Começar", fechada pelo Esc, sem voltar ao recarregar;
- H com M, C, T, H, I e E na ajuda;
- T, "t c m h" e Enter no chat; Esc, C e a resposta do Co-Pilot;
- M troca a câmera de verdade (a altura lida do three.js sobe de 4,5 m para 17 m), e M de novo volta;
- WASD até o Portal, E e I;
- no celular de 390 px: a boas-vindas do toque sem teclas, Começar e Chat por toque, sem passar da largura;
- nenhum erro e nenhuma requisição a outra origem.

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e
yarn dev      # demo em http://localhost:5173
```

## Limites

- **Na demo, E só avisa que entrou.** No produto, abre a sala do prédio.
- **O Co-Pilot da demo responde por palavra-chave.** No produto, ele responde pelo tutor de IA.
- **O chat da demo fica na memória.** No produto, é o chat da turma.
- **No produto:**
  - a lista vira o dado único dos atalhos do campus, lido pelo `useGameHotkeys`, pelo seletor de modo, pelo Help e pelo guia do aluno;
  - o seletor passa do C para o M;
  - o C e o T abrem o Co-Pilot e o chat que já existem;
  - a trava entra nos testes do HUD.
