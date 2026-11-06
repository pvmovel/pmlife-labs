# PoC: totem de vídeo na parede da sala

## O que esta PoC mostra

Uma sala 3D de uma escola de inglês fictícia, com **totens de vídeo do YouTube presos às paredes**. O aluno assiste à aula em vídeo sem sair do ambiente:

| Na sala | O que acontece |
| :--- | :--- |
| andar (WASD, setas ou joystick) até um totem | a moldura acende e aparece o aviso com o título e o botão **Assistir** |
| **E**, **Assistir** ou clicar/tocar no totem | o vídeo abre em **tela cheia**, com só o básico do PMLife: a marca, o título, **Fechar** e a moldura |
| com o vídeo aberto | a cena 3D **para de desenhar** (o vídeo usa a CPU e a bateria sozinho) |
| **Esc** ou **Fechar** | volta à sala, com o avatar no mesmo lugar e a cena andando de novo |
| vídeo removido, privado ou que o dono não deixa incorporar | um aviso, com o link para abrir no YouTube |
| a rede bloqueia o YouTube (ou caiu) | o mesmo aviso, depois de um prazo |

Embaixo da cena fica o que o **master da instituição** faz no editor do mundo:

- colar o link do YouTube, escolher a parede e a posição, e publicar;
- o link vira só o **ID do vídeo** na hora;
- o link que não é do YouTube é recusado sem gravar nada;
- o totem sobre a porta não é publicado, e o aviso aponta o totem.

O primeiro totem toca um vídeo de verdade; o segundo aponta para um vídeo que não existe, para mostrar o aviso. Os dados da escola são inventados.

## Como funciona

```text
src/
├── Content/room.json               a sala: tamanho, porta e os totens (parede, posição, largura, ID do vídeo, título)
├── Domain/                         TypeScript puro
│   ├── YouTube.ts                  o ID extraído do link (youtu.be, watch?v=, /embed/), o player youtube-nocookie
│   ├── Room.ts                     as regras da parede (a mesma dos objetos de parede do produto) e a sala como mini-campus
│   └── Player.ts                   o estado da tela do vídeo: carregando, pronto, falha (e o motivo), fechado
└── Presentation/
    ├── Engine3D/RoomCanvas.tsx     a sala (React.lazy); com o vídeo aberto, frameloop "never"
    ├── Engine3D/Totem3D.tsx        a moldura, a tela com o play e o título; clicar abre o vídeo
    ├── HUD/VideoOverlay.tsx        a tela cheia: o player, o protocolo de avisos, o foco preso, Esc
    └── HUD/TotemConfig.tsx         o que o master configura
```

| Técnica | Por quê |
| :--- | :--- |
| **Só o ID do vídeo é guardado** | O link colado passa pelo domínio, que aceita só os endereços do YouTube e o ID de 11 caracteres. Parâmetros como `si` (compartilhamento) são descartados. Nunca se guarda um link livre nem HTML, e o endereço do player é montado a partir do ID. |
| **youtube-nocookie.com** | O player não grava cookies de rastreamento antes do play, o que importa com alunos menores (LGPD). É o player oficial de incorporação: custo zero, sem chave de API e sem banda da hospedagem. |
| **Avisos do player por `postMessage`** | Com `enablejsapi=1`, o player avisa "pronto" ou o código do erro para a página, sem carregar nenhum script do YouTube nela. A página só aceita avisos da origem do player e do próprio iframe. Sem resposta a tempo, o aviso de rede bloqueada aparece. |
| **Totem = objeto de parede** | O totem é um tipo novo do mesmo objeto de parede do editor do mundo: a parede, a posição ao longo dela e a largura, com as mesmas regras (dentro da parede, fora da porta, sem sobrepor). Uma versão que não conhece o tipo simplesmente não o desenha. |
| **A sala é um mini-campus** | Cada totem vira um obstáculo fino encostado na parede, com raio de interação. O movimento, a colisão, a proximidade e o aviso funcionam sem código novo. |
| **A cena para com o vídeo aberto** | `frameloop="never"` no Canvas: nenhum quadro é desenhado enquanto o vídeo toca, e o avatar continua onde estava. |

### Testes

**No Node** (`yarn test`):

- **o domínio:**
  - a extração do ID em 10 formatos de link e a recusa de 11 casos (outro site, domínio falso, `javascript:`, HTML, ID curto ou longo);
  - o player sem cookies e sem `si`;
  - as regras da parede, o Gherkin do totem sobre a porta e o do link que não é do YouTube;
  - a proximidade e o estado da tela do vídeo, inclusive avisos atrasados;
- **a tela, com os cenários do Gherkin:**
  - E abre o vídeo em tela cheia e a cena para;
  - Esc e Fechar voltam à sala;
  - clique e toque;
  - o foco preso na janela;
  - o aviso de erro e o de rede bloqueada, com o link;
  - o master recusado (link e porta) e aceito (só o ID);
  - o inglês.

**No Chrome headless** (`yarn e2e`), com o build de verdade e um player falso na mesma origem do YouTube, que fala o mesmo protocolo (o teste não depende da rede):

- o teclado até o totem e o E;
- o vídeo na tela inteira, com 0 quadros desenhados enquanto ele está aberto;
- Esc e Fechar;
- o clique no totem;
- o master recusado e aceito;
- o vídeo removido e a rede bloqueada;
- no celular de 390 px: o joystick até o totem e o Assistir, sem nada passar da largura;
- nenhum erro e nenhuma requisição a outra origem além do player.

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e
yarn dev      # demo em http://localhost:5173
```

## Limites

- **O protocolo com o player real** foi conferido uma vez, com a rede de verdade: o vídeo da aula responde "pronto". Para um vídeo inexistente, o YouTube manda o código 150, o mesmo de "o dono não deixa incorporar". Por isso, o aviso cobre os dois casos. O e2e usa o player falso.
- **No produto:**
  - o totem fica no documento do curso, como os quadros: publicação validada nos dois validadores e versões;
  - o master põe o totem pelo editor do mundo;
  - os termos de uso ganham o parágrafo sobre o player sem cookies.
- **A câmera do aluno:** parado na porta, ele não vê os totens do fundo da sala; ele os encontra andando, como os quadros.
