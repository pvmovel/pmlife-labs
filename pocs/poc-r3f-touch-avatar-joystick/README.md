# PoC: ande com o avatar pelo toque

## O que esta PoC mostra

No celular, o campus 3D abre na **visão orbital** (a vista geral). Até aqui, o aluno no toque só via o campus de cima: o avatar andava só pelo teclado. Agora, ao tocar em **Avatar**, aparece um **joystick** no canto inferior esquerdo da cena:

| Gesto no joystick | O que faz |
| :--- | :--- |
| arrastar para **cima** / **baixo** | anda para a frente / para trás |
| arrastar para os **lados** | gira para o mesmo lado |
| **diagonal** | anda e gira ao mesmo tempo |
| **soltar** | o avatar para |

Perto de um prédio, o aviso aparece **no alto da cena** (embaixo ficam o joystick e o polegar) e diz **"Toque em Entrar ou Informações"**. Com uma janela aberta, o joystick some e o avatar fica parado. Com mouse e teclado, nada muda: o joystick não aparece e WASD/setas continuam valendo.

## Como funciona

```text
src/
├── Domain/TouchJoystick.ts         joystickToMoveInput(dx, dy, zonaMorta), clampToRadius, combineInputs (TypeScript puro)
└── Presentation/
    ├── HUD/TouchJoystick.tsx       Pointer Events com captura; a entrada vai para um ref lido a cada quadro
    ├── Engine3D/AvatarCanvas.tsx   entrada do avatar = teclado + joystick (combineInputs)
    ├── App.tsx                     joystick só no toque, no modo Avatar e sem janela aberta
    └── styles.css                  joystick no canto, touch-action: none; no toque, aviso no alto da cena
```

| Técnica | Por quê |
| :--- | :--- |
| **O joystick vira a mesma entrada do teclado** | `joystickToMoveInput` devolve o `MoveInput` (frente, trás, esquerda, direita) que o movimento já usa. Colisão, limites do mapa e câmera não mudam nada: o avatar não sabe de onde veio a entrada. |
| **Zona morta de 25% do raio** | O dedo nunca fica parado no centro; sem a zona morta, apoiar o polegar já faria o avatar andar. |
| **8 direções, como num direcional** | Um eixo só conta a menos de 67,5° do dedo. Um tremor para o lado enquanto se anda para a frente não faz o avatar girar; a diagonal de verdade anda e gira. |
| **Pointer Events com captura e um dedo só** | O joystick guarda o `pointerId` do primeiro dedo: arrastar para fora da base continua valendo, e um segundo dedo (pinça, toque num botão) não o sequestra. Soltar, cancelar ou perder a captura param o avatar. |
| **Ref em vez de estado na cena** | A cena lê o joystick a cada quadro por uma função; o React só redesenha o próprio joystick (o pino), nunca o canvas. |
| **Some com a janela aberta** | Ao desmontar, o joystick zera a entrada: o avatar não continua andando sozinho por trás da sala. |
| **`touch-action: none`** | O arraste no joystick não rola nem dá zoom na página. |

### Testes

**No Node** (60 testes, incluindo os das PoCs anteriores):

| Arquivo | O que prova |
| :--- | :--- |
| `TouchJoystick.spec.ts` | zona morta; **Gherkin** cima anda e lados giram; tremor lateral não gira; diagonais; além do raio; zona morta configurável; NaN e infinito param; pino preso na base; teclado e joystick somam |
| `TouchJoystickHud.spec.tsx` | no toque abre no Orbital sem joystick e o botão Avatar o mostra; **Gherkin** com mouse não aparece; a entrada chega à cena; aviso de toque; com a sala aberta o joystick some e a entrada zera; arrastar, girar e soltar; segundo dedo ignorado; zona morta |

**No Chrome headless** (`scripts/e2e.mjs`), com toque real num celular emulado (412 × 860):

- abre no Orbital sem joystick; tocar em **Avatar** mostra o joystick no canto inferior esquerdo;
- **arrastar para cima anda sem girar; soltar para**;
- andando pelo toque até a Biblioteca aparece o aviso, que não cobre o joystick; tocar em **Entrar** abre a sala, o joystick some e o avatar fica parado; fechando, o joystick volta;
- **arrastar para a esquerda e para a direita gira para o mesmo lado**; o arraste não rola a página;
- no computador, o joystick não aparece e o **W** continua andando;
- nenhum erro e nenhuma requisição externa.

## Achados

1. **O aviso no toque falava de teclas.** "Pressione [E]" não faz sentido no celular; o texto passou a ser "Toque em Entrar ou Informações".
2. **O aviso disputava o espaço com o polegar.** No celular, o aviso centralizado embaixo cobria o joystick; no toque (`pointer: coarse`), ele sobe para o alto da cena.
3. **Joystick × "tocar para andar".** O joystick é determinístico (mesma entrada que o teclado, testável sem navegador) e não conflita com o toque que seleciona prédios no Orbital. "Tocar no chão para andar" exigiria rota e desvio de prédios, e confundiria com o toque de seleção.

## Demo

No celular (ou no DevTools, em modo celular com toque), toque em **Avatar** e arraste o joystick. Ande até a Biblioteca e toque em **Entrar**. No computador, a demo funciona como antes, com WASD ou setas.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 60 testes + e2e com toque num celular emulado (CHROME_PATH se não estiver em /usr/bin)
yarn dev      # demo em http://localhost:5173
```
