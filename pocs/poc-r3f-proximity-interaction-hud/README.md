# PoC: chegue perto de um prédio e interaja

## O que esta PoC mostra

Andando com o avatar pelo campus, ao **chegar perto de um prédio** aparece um aviso: **"Pressione [E] para Entrar ou [I] para Informações"**, e o prédio ganha um contorno no chão. Em qualquer lugar, **H** abre o guia do aluno.

| Tecla | O que faz |
| :--- | :--- |
| **I** (perto de um prédio) | informações do prédio |
| **E** (perto de um prédio) | entra na sala: conteúdo e missões do prédio |
| **H** | guia do aluno e controles do campus |
| **Esc** | fecha a janela aberta |
| W/S, A/D, setas, C | andar, girar e alternar a visão (como na PoC do avatar) |

**Os atalhos nunca atrapalham a digitação:** num campo de texto, "e", "i" e "h" são só letras.

## Como funciona

```
src/
├── Content/
│   ├── campus.json                         prédios, com raio de interação opcional (padrão 3 m)
│   ├── Locales/<idioma>.json               aviso, informações e missões de cada sala
│   └── Guides/<idioma>/GUIA_DO_ALUNO.md    o guia: fonte única, em Markdown
├── Domain/Proximity.ts                     distância até a parede + prédio mais próximo no alcance
└── Presentation/
    ├── Engine3D/ProximityTrigger.tsx       a cada quadro, qual prédio está no alcance (avisa só quando muda)
    ├── hooks/useGameHotkeys.ts             I, E e H (ignora campos de texto, Ctrl/Cmd/Alt e repetição)
    └── HUD/
        ├── InteractionPrompt.tsx           o aviso (aria-live)
        ├── Modal.tsx                       janela acessível: aria-modal, foco preso, Esc, foco devolvido
        ├── BuildingInfoModal.tsx           tecla I
        ├── BuildingRoomPanel.tsx           tecla E (prévia da sala; a cena 3D interna é uma etapa futura)
        └── HelpModal.tsx                   tecla H: Markdown ➔ marked ➔ DOMPurify
```

| Técnica | Por quê |
| :--- | :--- |
| **Distância até a parede, não até o centro** | Com prédios de tamanhos diferentes, "3 m do centro" seria dentro de um prédio grande e longe de um pequeno. O domínio mede até o retângulo do prédio, e com dois prédios no alcance vence o mais perto. |
| **Raio no conteúdo** | Cada prédio pode ter o seu `interactionRadius` no JSON (um auditório grande pode ter um raio maior), sem mudar código. |
| **Proximidade fora do React** | O `ProximityTrigger` roda a cada quadro dentro da cena, mas só avisa a página quando o prédio no alcance muda: nada de re-render a cada quadro. |
| **Atalhos seguros** | O hook ignora eventos vindos de `input`, `textarea`, `select` e editores, as combinações com Ctrl/Cmd/Alt (que são do navegador) e a repetição de tecla segurada. |
| **Uma janela por vez** | Com uma janela aberta, os atalhos param e o avatar fica parado; **Esc** fecha. |
| **Modal acessível** | `role="dialog"`, `aria-modal` e título por `aria-labelledby`; o foco entra na janela, Tab e Shift+Tab circulam dentro dela, e ao fechar o foco volta para onde estava. |
| **Guia como fonte única** | O guia é um `.md` versionado, importado com `?raw` do Vite, convertido pelo `marked` e **sanitizado pelo DOMPurify** antes de entrar na página. |

### Testes

**No Node** (34 testes, incluindo os da PoC do avatar):

| Arquivo | O que prova |
| :--- | :--- |
| `Proximity.spec.ts` | distância até a parede, de canto e por dentro; dentro e fora do raio de 3; raio vindo do JSON; o mais perto vence; raio inválido recusado |
| `InteractionHud.spec.tsx` | **os 3 cenários do Gherkin**: aviso traduzido ao entrar no raio (e some ao sair); H abre o guia no idioma ativo (PT e EN); digitar e/i/h num campo não abre nada. Também: I e E só perto de um prédio, Ctrl/Cmd+H não abre, e não se abre uma janela por cima de outra |
| `Modal.spec.tsx` | aria-modal, foco preso (Tab e Shift+Tab), Esc fecha e devolve o foco; o Markdown perde `<script>`, `onerror` e `javascript:` |

**No Chrome headless** (`scripts/e2e.mjs`, teclas reais): longe não há aviso; andando até a Biblioteca o aviso aparece a menos de 3 m da parede; I, E e H abrem as janelas certas (com o foco dentro); com uma janela aberta o avatar não anda; Esc fecha; digitar "hie HIE" no campo de anotações não abre nada e o texto chega ao campo; ao se afastar o aviso some; nenhum erro e nenhuma requisição externa.

## Achados

1. **O centro do prédio engana.** O primeiro desenho media a distância até o centro; com prédios de 3 a 6 m de largura, o aviso aparecia cedo demais nos grandes e tarde demais nos pequenos. Medir até a parede resolve.
2. **"Ignorar quando digita" precisa de mais que o `input`.** Também `textarea`, `select`, editores (`contenteditable`) e as combinações com Ctrl/Cmd: Ctrl+H é o histórico do navegador.
3. **Uma janela por vez simplifica tudo.** Desligar os atalhos e o avatar enquanto há uma janela aberta evita estados estranhos (abrir a sala com o guia aberto, andar com o painel na frente).
4. **Sanitizar mesmo o próprio conteúdo.** O guia é nosso, mas o mesmo caminho vai servir para conteúdo de cliente (SaaS multi-trilha). O DOMPurify sai na frente desde já.
5. **Teste de componente não checa tipos.** Um erro de tipo num teste passou no Vitest e só apareceu no `tsc` do build. Por isso o `verify` roda `tsc` antes dos testes.

## Demo

Ande com **W** até a Biblioteca: o aviso aparece. Aperte **I**, **E** e **H**; **Esc** fecha. Depois clique no campo de anotações e digite à vontade.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 34 testes + e2e no Chrome headless (CHROME_PATH se não estiver em /usr/bin)
yarn dev      # demo em http://localhost:5173
```
