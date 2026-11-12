# PoC: portais pelo teclado

## O que esta PoC mostra

Uma praça de uma escola de idiomas inventada, com o avatar e três prédios: o **Portal dos cursos**, o **Portal das fases** e as **Matrículas**. O aluno que anda pelo teclado escolhe o curso ou a fase **sem pegar o mouse**:

| Tecla | O que faz |
| :--- | :--- |
| WASD ou setas | anda com o avatar até um prédio |
| **E** | abre a janela do prédio, com o foco na lista e o destaque na fase em andamento |
| **1** a **9** e **0** | escolhe o item da página na hora (o 0 é o 10º); vale o teclado numérico |
| **←** / **→**, **PageUp** / **PageDown** | trocam a página de 10 |
| **↑** / **↓** e **Enter** | movem o destaque e entram |
| **Home** / **End** | vão ao primeiro e ao último item |
| **Esc** | fecha a janela (no campo do código, volta à lista) |

- O Portal das fases tem **30 fases**, em 3 páginas. A fase **bloqueada** não abre pelo número: fica destacada, e o motivo é lido.
- Nas Matrículas, o número faz o que o botão do curso faz. No curso **por código de convite**, ele leva ao campo do código, e digitar o código (com números) nunca escolhe outro curso. O código da demo é `AURORA-2026`.
- Com a janela aberta, **as setas não andam com o avatar** atrás dela.
- No celular, tocar no prédio e no item continua valendo, e as teclas não aparecem.

Os dados da escola são inventados.

## Como funciona

```text
src/
├── Content/world.json              a praça, os prédios, os cursos, as 30 fases (com o estado) e as matrículas
├── Domain/                         TypeScript puro
│   ├── KeyboardList.ts             páginas de 10, a tecla de cada item, o número pelo `code`, as setas, o destaque inicial
│   ├── Plaza.ts                    o avatar em 2D e a trava: com a janela aberta (ou digitando), ele não anda
│   └── Enrollment.ts               o que escolher um curso faz em cada método (livre, código, aprovação)
└── Presentation/
    ├── HUD/KeyboardList.tsx        a lista no padrão listbox do WAI-ARIA, usada pelas três janelas
    ├── HUD/Modal.tsx               a janela acessível: foco preso, Esc, o foco inicial na lista
    ├── HUD/PortalModal.tsx         os dois portais
    ├── HUD/EnrollmentModal.tsx     as Matrículas, com o campo do código
    └── App.tsx                     a praça, o avatar e a tecla E
```

| Técnica | Por quê |
| :--- | :--- |
| **Listbox do WAI-ARIA** | O foco fica na lista (`role="listbox"`), e o `aria-activedescendant` aponta o item destacado: o leitor de tela anuncia o item sem o foco pular de botão em botão. Cada item tem `aria-keyshortcuts` com a tecla dele, e a página ("Página 2 de 3") é anunciada. |
| **Foco inicial na lista** | A janela abre com o foco na lista, e não no "Fechar" (o primeiro botão). Sem isso, o Enter fecharia a janela, e o número não faria nada. |
| **O número pelo `code`** | `Digit1` a `Digit0` e `Numpad1` a `Numpad0`, em qualquer layout de teclado (no AZERTY, o `key` do 1 é "&"). |
| **Atalhos só com o foco na lista (WCAG 2.1.4)** | O número só vale na lista. No campo do código ele é texto, e nenhum atalho dispara fora da janela. |
| **O número vai direto** | Como nos menus de jogo: uma tecla, sem confirmar. O erro custa pouco (é só voltar pelo portal), e a fase bloqueada nunca abre. |
| **Páginas, sem digitar o número** | Com o limite de 30 fases por curso, qualquer fase fica a no máximo 2 teclas (→ e o número). Digitar "12" brigaria com o "vai direto" do 1. |
| **O avatar parado com a janela aberta** | A janela e o avatar ouvem as mesmas setas, porque a tecla sobe da lista até a `window`. A regra do domínio `avatarStep(…, blocked)` ignora as teclas com a janela aberta ou com o aluno digitando. |

### Testes

**No Node** (`yarn test`):

- **o domínio:**
  - as páginas;
  - a tecla de cada posição e o número pelo `code`;
  - a tecla sem item na página curta;
  - as setas sem dar a volta e o ←/→ na página curta;
  - Home e End;
  - o destaque inicial;
  - a fase bloqueada;
  - o avatar parado com a janela aberta e a velocidade na diagonal;
  - o que cada método de matrícula faz;
- **a tela, com os cenários do Gherkin da US52:**
  - o foco na lista e o destaque na fase em andamento;
  - o número;
  - o Enter;
  - a fase bloqueada com o motivo lido;
  - as 30 fases em 3 páginas, com o 0 na 30ª;
  - o teclado numérico, ↑/↓, Home e End;
  - o clique;
  - o Esc;
  - o inglês;
  - os 12 cursos em 2 páginas;
  - as Matrículas: livre, aprovação, o código certo e o errado, os números no campo e o Esc no campo;
  - o avatar parado atrás da janela, e andando sem ela.

**No Chrome headless** (`yarn e2e`), com o build de verdade e teclas reais:

- as setas seguradas até o portal e o E;
- o foco na lista;
- o 3, o →→0 e a fase bloqueada;
- segurar as setas com a janela aberta sem o avatar andar;
- o Esc;
- as Matrículas com o código digitado e o Enter;
- no celular de 390 px (toque): o prédio e o curso tocados, as teclas escondidas e nada passando da largura;
- nenhum erro e nenhuma requisição a outra origem.

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e no Chrome headless
yarn dev      # demo em http://localhost:5173
```

## Achado

O laço do avatar chamava `setAvatar((at) => avatarStep(at, teclas, (agora - ultimo) / 1000, …))` e atualizava `ultimo` logo depois. O React pode rodar esse atualizador mais tarde, quando `ultimo` já é igual a `agora`: o intervalo vira 0, e o avatar só anda no primeiro quadro. O intervalo agora é fixado numa constante antes do atualizador, e um teste segura a tecla e exige vários quadros de movimento (com o defeito de volta, ele falha). No produto, o avatar anda pelo `useFrame` do R3F, com o intervalo do próprio quadro, então o defeito não existe lá; a lição vale para qualquer laço com estado do React.

## Limites

- **A praça é 2D:** a PoC prova o padrão da lista e a trava do avatar. No produto, a mesma trava vai para as teclas do `KeyboardControls` (o avatar 3D) com qualquer janela aberta, e o componente da lista substitui as listas do `PortalModal` e do `EnrollmentModal`.
- **Leitor de tela:** os papéis (`listbox`, `option`), o `aria-activedescendant`, o `aria-keyshortcuts` e as regiões anunciadas seguem o WAI-ARIA, e os testes conferem cada um. A conferência com um leitor de tela de verdade (NVDA ou Orca) fica para a homolog do produto.
