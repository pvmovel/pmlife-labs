# PoC: objetos da sala no chão ou na parede

## O que esta PoC mostra

Uma sala de um curso fictício, já no tamanho novo: **paredes de 18 m e a porta perto do canto**. Cada objeto (o totem de vídeo e o quadro de texto; no produto, também as ferramentas de ensino que vêm) pode ficar **numa parede** ou **em pé no chão**:

| No editor | O que acontece |
| :--- | :--- |
| um totem **No chão** | ele fica num pedestal, no ponto (x, z), com a frente virada para onde o master escolheu; perto dele, o **E** abre o vídeo em tela cheia, como na parede |
| um quadro **No chão** | vira uma **placa de aviso** num poste, com o mesmo texto |
| o **6º quadro** numa parede | recusado: cada parede aceita **até 5**, somando quadros e totens; o que fica no chão não conta |
| um objeto no chão **no corredor da porta** | recusado, apontando o objeto |
| objetos do chão que **fecham a passagem** até uma mesa | recusado, dizendo a mesa que ficou sem caminho |
| **Começar uma sala nova** | 18 m, a porta perto do canto: a parede da porta também recebe 5 quadros de 2,4 m |

Um documento de antes, sem o campo novo, continua igual: tudo na mesma parede e na mesma posição. O curso, as mesas e os textos são inventados.

## Como funciona

```text
src/
├── Content/room.json              a sala de exemplo (18 m, a porta perto do canto, a norte cheia, a placa no chão)
├── Domain/Room.ts                 TypeScript puro: o objeto na parede ou no chão, as regras e a passagem livre
└── Presentation/
    ├── Engine3D/RoomItems3D.tsx   o totem e o quadro, na parede ou no chão (pedestal, placa de aviso)
    ├── Engine3D/RoomCanvas.tsx    a sala (React.lazy), com o avatar e a câmera da sala do produto
    └── HUD/RoomEditor.tsx         o editor: chão ou parede, posição, "Acrescentar quadro", "Publicar"
```

| Técnica | Por quê |
| :--- | :--- |
| **Um campo opcional** | `placement: "wall" \| "floor"` em todo objeto. Sem ele, vale `wall`: os documentos publicados não mudam, e não há migration. Na parede: `wall`, `offset` e `width`; no chão: `x`, `z`, `facing` e `width`. Trocar de lugar descarta a posição de antes (o documento nunca guarda as duas). |
| **Até 5 por parede** | Quadros e totens somam no mesmo limite; o 6º é recusado com a parede (`WALL_ITEMS_TOO_MANY`). O chão não conta, e continua o teto de 20 objetos por sala. |
| **As regras do chão** | Dentro da sala, fora do corredor da porta (do vão até onde o aluno aparece ao entrar), sem sobrepor as mesas nem outro objeto do chão. |
| **A passagem livre** | Uma busca em largura numa grade de 25 cm, com a mesma colisão do avatar (uma caixa de 1 m): a partir da porta, cada mesa e cada totem precisa ficar no alcance (o mesmo raio do aviso do jogo). Só conta o que os objetos do chão fecharam: uma sala de antes nunca passa a ser recusada. O problema fica no objeto que, sozinho, fecha o caminho (ou no último, quando só juntos eles fecham). |
| **A sala nova** | Meio lado 9 (paredes de 18 m) e a porta perto do canto (x = -6,5 m): com a porta no meio, a parede sul só caberia 4 quadros de 2,4 m (decisão do Pablo, 2026-11-15). |
| **O mesmo E** | O totem no chão é o mesmo alvo da parede: obstáculo com raio de interação. A placa e as mesas da demo são só obstáculo. |

### Testes

**No Node** (`yarn test`, 32 testes):

- **o domínio:**
  - os 6 cenários do Gherkin;
  - o chão sem contar na parede;
  - fora da sala e sobre uma mesa;
  - a barreira que fecha as mesas e a brecha de 2,6 m que deixa passar;
  - a largura de lado para a frente;
  - o conteúdo malformado.
- **a tela:**
  - os 6 cenários pelo editor (inclusive o E abrindo o vídeo do totem no chão);
  - a passagem fechada até as duas mesas;
  - o inglês.

**No Chrome headless** (`yarn e2e`), com o build de verdade:

- os objetos lidos do **grafo do three.js** (`window.__items`), não do editor;
- o totem levado para o chão, o avatar andando até ele pelo teclado e o E abrindo o vídeo;
- a placa de aviso, o 6º quadro e o corredor da porta recusados sem mudar a cena;
- os 5 quadros na parede da porta da sala nova;
- o celular de 390 px;
- nenhum erro e nenhuma requisição a outra origem além do player.

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e
yarn dev      # demo em http://localhost:5173
```

## Limites

- **As mesas da demo não abrem nada.** No produto, o E usa a estação.
- **O editor da demo é uma lista de campos.** No produto, é a planta vista de cima do editor do mundo, com arrastar e as setas.
- **No produto:**
  - o campo entra no documento do curso (schema 1), nos dois validadores (TypeScript e PHP), com os casos de conformidade;
  - o "Dev a PM" ganha uma versão com as salas maiores;
  - todo tipo novo de ferramenta declara as duas formas.
