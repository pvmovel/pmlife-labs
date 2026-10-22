# PoC: entre de verdade no prédio

## O que esta PoC mostra

No campus 3D, apertar **E** perto de um prédio (ou tocar em **Entrar**, inclusive no modo Orbital) abria um painel com as missões. Agora a tela escurece e o aluno está **dentro da sala**, com o mesmo avatar:

| Na sala | O que faz |
| :--- | :--- |
| andar (WASD, setas ou joystick) | o avatar anda e para nas mesas e nas paredes |
| chegar perto de uma estação | aparece o aviso com a missão e o botão **Usar** |
| **E** ou **Usar** | conclui a missão e soma o XP; a estação fica verde |
| sair pela porta (faixa amarela) ou **Esc** | volta ao campus **diante da porta** do prédio, olhando para fora |

A **Lista de missões** continua no aviso do prédio, como alternativa (leitor de tela, quem prefere lista), e conclui as mesmas missões. Prédios sem sala (aqui, Auditório e Cafeteria) continuam abrindo o painel.

## Como funciona

```text
src/
├── Content/interiors.json           as salas: tamanho, porta e estações (missão, XP, posição, tamanho, cor)
├── Domain/Interior.ts               validação contra o campus, a sala como mini-campus, porta e ponto de saída
└── Presentation/
    ├── App.tsx                      campus ⇄ sala com escurecer, E/Usar na estação, Esc, XP
    ├── Engine3D/InteriorCanvas.tsx  a sala (React.lazy: chunk próprio, baixado na primeira entrada)
    ├── Engine3D/KeyboardAvatar.tsx  teclado + joystick no avatar, o mesmo no campus e na sala
    └── HUD/StationPrompt.tsx        aviso da estação
```

| Técnica | Por quê |
| :--- | :--- |
| **A sala é um mini-campus** | O domínio converte o interior em `Campus` (paredes = limite do mapa, estações = obstáculos com raio de interação). Movimento, colisão, proximidade, aviso, câmera e joystick funcionam lá dentro sem uma linha nova. |
| **Orientado a dados e validado** | `interiors.json` é conferido ao abrir a página: prédio inexistente, porta fora da parede, estação fora das paredes, estações sobrepostas, estação bloqueando a porta, id repetido ou saída ocupada no campus falham com a mensagem do campo. |
| **Volta diante da porta** | O ponto de saída é calculado da face sul do prédio (a mesma por onde se entra) e validado contra os outros prédios. O campus é remontado com esse ponto de partida. |
| **Câmera dentro das paredes** | Atrás do avatar, a câmera ficaria do lado de fora da parede e a esconderia a cena; na sala, ela é limitada às paredes. |
| **Chunk próprio, geometria simples** | A sala é `React.lazy` e reaproveita o 3D do campus: o chunk tem cerca de 1 KB com gzip. Sem modelo externo: nada a baixar nem a cachear. |

### Orçamento de desempenho (decisão do produto: celular médio)

| Meta | Resultado |
| :--- | :--- |
| Entrar em até 1 s | ~0,5 s na primeira entrada (com o download do chunk) e ~0,4 s nas seguintes |
| Chunk da sala até 50 KB com gzip | ~1 KB |
| 30 FPS no celular com a CPU 4× mais lenta | No Chrome headless (WebGL por software), o FPS fica em ~20 **com ou sem** a CPU limitada, e o campus fica até abaixo da sala: o gargalo é a renderização por software, não a sala. O e2e confere que **a sala não pesa mais que o campus**; os 30 FPS são conferidos num celular com GPU. |

### Testes

**No Node** (76 testes, incluindo os das PoCs anteriores):

| Arquivo | O que prova |
| :--- | :--- |
| `Interior.spec.ts` | conteúdo válido; recusa prédio inexistente, porta fora da parede, sala vazia, XP inválido, estação fora das paredes, sobreposta ou bloqueando a porta, id repetido e saída ocupada; a sala como mini-campus (entra olhando para o fundo, anda até a mesa e para, de ré sai pela porta, fora do vão não sai); ponto de saída |
| `InteriorFlow.spec.tsx` | **Gherkin**: E abre a sala; a estação (E ou Usar) conclui e soma o XP, sem somar de novo; Esc e a porta voltam diante da porta; no Orbital, Entrar abre a sala. Também: a lista de missões conclui as mesmas missões; prédio sem sala abre o painel |

**No Chrome headless** (`scripts/e2e.mjs`), com teclas, mouse e toque reais:

- andando até a Biblioteca, E abre a sala em ~0,5 s;
- até a estação, E conclui (300 XP);
- **de ré pela porta, e com Esc, o campus volta com o avatar em (0; 3,5) olhando para fora**;
- a sala não pesa mais que o campus com a CPU 4× mais lenta; o chunk tem ~1 KB;
- no Orbital, clicar no Laboratório e em Entrar abre a sala dele;
- **no celular**, Entrar abre a sala com o joystick, e o joystick leva o avatar de volta pela porta;
- nenhum erro e nenhuma requisição externa.

## Achados

1. **Um ✓ no rótulo 3D chamava um CDN.** O texto 3D (troika) busca no `cdn.jsdelivr.net` uma fonte reserva para caracteres que a fonte embutida não tem. A Inter latin não tem o ✓. O e2e pegou a requisição externa, e a estação concluída passou a ficar verde. Isso fere a regra do cache (nenhum asset fora do bundle com hash) e vale para qualquer texto 3D do produto.
2. **O headless não mede GPU.** Medir FPS no Chrome headless dá ~20 até no campus, com ou sem limite de CPU: o orçamento absoluto precisa de um aparelho de verdade, e o teste automático compara a sala com o campus.
3. **A câmera atrás do avatar atravessa a parede.** Em espaço aberto não aparece; numa sala, a parede sul tapava a cena logo na entrada.

## Demo

Ande até a **Biblioteca** (W ou ↑) e aperte **E**. Na sala, vá até a mesa e aperte **E** de novo; saia pela faixa amarela (de ré com S) ou com **Esc**. No **Orbital**, clique no **Laboratório** e em **Entrar**. No celular, toque num prédio e em **Entrar**; use o joystick na sala.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 76 testes + e2e com teclas, mouse e toque e o orçamento de desempenho (CHROME_PATH se não estiver em /usr/bin)
yarn dev      # demo em http://localhost:5173
```
