# PoC: clique num prédio, sem andar até ele

## O que esta PoC mostra

No modo **Orbital** (a vista geral do campus, e o modo em que o celular abre), **clicar ou tocar num prédio o seleciona**: ele ganha o contorno no chão e o painel mostra **Entrar** e **Informações**. As teclas **E** e **I** também valem para o selecionado.

| Ação | O que faz |
| :--- | :--- |
| clicar / tocar num prédio | seleciona (outro clique troca a seleção) |
| **Entrar** ou **E** | abre a sala do prédio selecionado |
| **Informações** ou **I** | abre as informações |
| **×** ou **Esc** | desfaz a seleção |
| arrastar | gira a câmera, **sem** selecionar |
| **C** | alterna Avatar ⇄ Orbital (trocar de modo desfaz a seleção) |

No modo **Avatar** tudo continua como na PoC de proximidade (o aviso aparece ao chegar perto), e os botões do aviso também passam a funcionar com mouse e toque.

## Como funciona

```
src/Presentation/
├── App.tsx                       alvo = proximidade do avatar (Avatar) ou seleção (Orbital); Esc e troca de modo
├── Engine3D/
│   ├── picking.ts                clique × arraste: até 6 px de deslocamento é clique (toque incluído)
│   ├── Building3D.tsx            onClick/onPointerOver no grupo do prédio (corpo e rótulo), cursor de clicável
│   └── AvatarCanvas.tsx          só passa o onSelect no modo Orbital e sem janela aberta
└── HUD/InteractionPrompt.tsx     botões Entrar, Informações e × (o painel recebe cliques; a região em volta, não)
```

| Técnica | Por quê |
| :--- | :--- |
| **O alvo depende do modo** | No Avatar, o alvo é o prédio no alcance; no Orbital, o que foi clicado. Misturar os dois faria o aviso de um prédio perto do avatar aparecer enquanto o aluno olha outro lá do alto. |
| **Clique × arraste pelo `delta`** | O React Three Fiber informa quantos pixels o ponteiro andou entre apertar e soltar. Acima de 6 px é o fim de um giro da câmera, não uma escolha. Os 6 px de folga cobrem o dedo, que nunca fica parado num toque. |
| **Evento no grupo, `stopPropagation`** | O clique no rótulo conta como clique no prédio, e só o objeto mais à frente reage (sem selecionar o prédio de trás). |
| **Clicável só quando faz sentido** | Fora do Orbital, ou com uma janela aberta, o prédio não recebe `onClick` e o cursor volta ao normal, mesmo que o mouse esteja em cima dele. |
| **Esc em camadas** | Com uma janela aberta, o Esc fecha a janela e a seleção continua; sem janela, o Esc desfaz a seleção. O Modal marca o Esc que tratou com `preventDefault`. |
| **Botões no aviso** | No toque não há teclas: os botões são o único caminho. Eles também servem ao mouse no modo Avatar. |

### Testes

**No Node** (45 testes, incluindo os das PoCs anteriores):

| Arquivo | O que prova |
| :--- | :--- |
| `InteractionHud.spec.tsx` | **Gherkin**: clicar seleciona e mostra Entrar e Informações; Entrar abre a sala; Informações (botão ou I) abre "Sobre". Também: fora do Orbital o prédio não é clicável; com janela aberta não se troca a seleção; × e Esc desfazem; no Orbital o alcance do avatar não gera aviso; trocar de modo desfaz a seleção; botões no modo Avatar; tradução em inglês |
| `OrbitalPicking.spec.tsx` | no grafo do three.js: clique parado (3 px) seleciona e o fim de um arraste (40 px) não; o rótulo está dentro do grupo clicável; cursor de clicável ao passar o mouse; sem `onSelect`, nada é clicável e o cursor volta ao normal |

**No Chrome headless** (`scripts/e2e.mjs`), com a posição de cada prédio na tela calculada pela mesma câmera da vista geral:
- cursor de clicável sobre a Biblioteca, clique seleciona, Entrar abre a sala, Esc fecha a sala mantendo a seleção, I abre as informações;
- trocar a seleção, × e Esc desfazendo;
- **arrastar a partir da Cafeteria gira a câmera sem selecionar**;
- trocar de modo desfaz a seleção;
- **num celular emulado (toque)**, o campus abre no Orbital, tocar na Biblioteca a seleciona e tocar em Entrar abre a sala;
- nenhum erro e nenhuma requisição externa.

## Achados

1. **O Esc chega duas vezes.** No navegador, o mesmo Esc que o Modal trata (no `document`) continua subindo até a `window`. Na primeira versão, fechar a sala com Esc também desfazia a seleção. O teste de componente não pegou isso; o e2e pegou. A correção foi ignorar o Esc já marcado com `preventDefault`.
2. **"Clique" no 3D precisa de tolerância.** Sem o limite de deslocamento, todo giro da câmera que terminasse em cima de um prédio o selecionaria.
3. **O cursor fica preso.** Se o modo muda com o mouse em cima de um prédio, o `onPointerOut` nunca chega; o prédio precisa limpar o cursor quando deixa de ser clicável.

## Demo

Aperte **C** (ou o botão **Orbital**) e clique num prédio. Use **Entrar**/**Informações** ou **E**/**I**. Arraste para girar: nada é selecionado. **×** ou **Esc** desfaz. No celular, a demo já abre no Orbital: toque num prédio.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 45 testes + e2e com mouse, arraste e toque (CHROME_PATH se não estiver em /usr/bin)
yarn dev      # demo em http://localhost:5173
```
