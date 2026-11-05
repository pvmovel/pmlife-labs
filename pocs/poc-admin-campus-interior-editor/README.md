# PoC: editor da cidade e dos interiores dos prédios

## O que esta PoC mostra

O editor do mundo 3D no painel de administração de uma plataforma de ensino com várias instituições. O master de uma instituição monta, sem esperar uma versão nova da plataforma:

| O quê | Como |
| :--- | :--- |
| **A cidade** (a sede, a cidade de um curso ou a de uma fase) | Uma planta vista de cima: arrastar os prédios com o mouse ou o toque, ou movê-los com as setas do teclado. O painel ao lado tem o nome nos dois idiomas, a posição, o tamanho e a cor. Os prédios obrigatórios mudam de lugar, de cor e de nome, mas não saem da cidade. |
| **O interior de cada prédio** | A sala, a posição da porta, as estações de missão (cada uma ligada a uma missão do prédio) e os **objetos de parede**. Hoje o único objeto é o quadro, com um texto; o totem de vídeo será outro tipo. |
| **Os problemas, na hora** | A cada edição, a mesma validação que o servidor faz antes de publicar: fora do mapa, prédio sobre prédio, ponto de chegada dentro de um prédio, estação bloqueando a porta, estação fora das paredes, objeto sobre a porta. Cada problema aparece na lista e marcado na planta, e clicar nele leva ao item. |
| **Rascunho e publicação** | Editar mexe só no rascunho. Publicar valida, cria a versão nova e apaga o rascunho. A "Visão do aluno" mostra a versão publicada. |
| **A pré-visualização 3D** | Abre numa janela, com o mesmo motor 3D do campus. Ela fica num pedaço próprio do pacote e só é baixada quando alguém pede. |
| **Isolamento** | "Instituição (demonstração)" troca para outra instituição: as mudanças de uma não aparecem na outra. |
| **Curso da plataforma** | É só para ver. "Copiar para editar" cria um documento da instituição, que passa a ser dela. |

Os dados são inventados e ficam só na memória do navegador.

## Como funciona

```text
src/
├── Domain/                      TypeScript puro (sem React nem Three.js)
│   ├── World.ts                 o formato editável: cidade, prédios, chegada, interiores (sala, porta, estações, objetos de parede)
│   ├── validateWorld.ts         a validação, com códigos estáveis e o caminho de cada item (JSON Pointer)
│   ├── editing.ts               as edições puras (mover, ajustar, acrescentar, tirar), sempre na grade de meio metro
│   └── Drafts.ts                rascunho e publicação; a cópia do curso da plataforma
├── Content/                     as instituições e os documentos falsos, e os textos pt-BR e en-US
└── Presentation/
    ├── App.tsx                  a lista de documentos, a barra de ações, a planta, o painel e os problemas
    ├── useEditor.ts             o estado do editor (as regras ficam no Domain)
    ├── components/PlanView.tsx  a planta em SVG: arrastar, setas, Delete e Enter, com os nomes para o leitor de tela
    ├── components/Inspector.tsx os campos do item selecionado, ou os da cidade e da sala
    └── Preview3D.tsx            a pré-visualização 3D (React Three Fiber), carregada sob demanda
```

| Técnica | Por quê |
| :--- | :--- |
| **A planta em SVG, em metros** | O `viewBox` usa as coordenadas do mundo, então o arrastar converte o ponteiro direto para metros, sem conta de escala. A planta escala sozinha da tela do computador para a do celular. |
| **Cada item é um botão** | Prédios, estações e objetos têm `tabIndex`, um nome falado (o nome, a posição e o problema, se houver) e o `aria-pressed` da seleção. Dá para editar tudo só com o teclado. |
| **Uma validação só** | A mesma regra roda no editor, na hora, e no servidor, antes de publicar. Os códigos são estáveis e a tela os traduz. O caminho de cada problema seleciona o item. |
| **Edições puras** | Cada edição devolve um mundo novo, então o rascunho é só o último mundo, e descartar volta à versão publicada. Uma edição que não muda nada não cria rascunho. |
| **Objetos de parede como campo opcional** | O interior ganha `wallItems` sem trocar a versão do formato: os documentos antigos continuam válidos, e o totem de vídeo entra como um tipo novo. |
| **3D sob demanda** | Com `React.lazy`, o Three.js fica num pedaço separado: o editor abre com o pacote pequeno, e o 3D só vem quando a janela abre. |

### Testes

**No Node** (`yarn test`):
- o Domain: cada código da validação, as edições na grade, o prédio obrigatório e o ciclo de rascunho e publicação;
- a tela, com os cenários do Gherkin:
  - a instituição monta o interior e publica, e o aluno vê as duas estações;
  - a estação sobre a porta não é publicada, e o problema aponta a estação;
  - a cidade de uma instituição não aparece na outra.

  Também: o teclado, o quadro na parede, o curso da plataforma, a janela 3D e o inglês.

**No Chrome headless** (`yarn e2e`), com o build de verdade:
- o teclado e o mouse movendo prédios na planta;
- duas estações publicadas, e a estação sobre a porta recusada;
- o pedaço do 3D baixado só ao abrir, com o canvas WebGL ocupando a janela;
- no celular de 390 px: a gaveta, a planta na tela e nenhuma rolagem horizontal;
- o tema claro, nenhum erro e nenhuma requisição a outra origem.

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e
yarn dev      # demo em http://localhost:5173
```

## Limites

- É só a tela: os dados são falsos e ficam na memória. O rascunho no servidor, a publicação validada pela API e o isolamento no banco ficam no produto, com a mesma regra.
- Editar a camada de um curso vinculado à plataforma (acrescentar ao que a plataforma não travou) fica para depois: aqui o curso da plataforma é só para ver e copiar.
- A pré-visualização mostra caixas e cores; o campus de verdade usa o mesmo motor, com os prédios, os rótulos e o avatar.
