# PoC: converse com os personagens do campus

## O que esta PoC mostra

Andando com o avatar pelo campus, ao **chegar perto de um personagem (NPC)** aparece o aviso **"Pressione [E] para conversar"**, e um anel aparece no chão em volta dele. **E** abre a conversa: o aluno escreve, o personagem responde com a **própria voz** e **lembra das 3 últimas trocas**. O NPC também vira o rosto para o avatar quando ele se aproxima.

Os prédios continuam como na PoC de proximidade (**I** informações, **E** entrar, **H** guia). Com um prédio e um NPC no alcance, vence o mais perto.

> **Nesta demo nenhuma IA é chamada.** Um mock em PHP responde com frases prontas de duas personas fictícias ("Guia do Museu" e "Astrônoma"), com o **mesmo contrato** do endpoint do produto. O caminho até a IA de verdade (Gemini ➔ Groq, limite por IP, teto global) está no [`spike-zero-cost-ai-gateway`](../../spikes/spike-zero-cost-ai-gateway).

## Contrato

```
POST public/npc_chat.php
{ "persona": "museum_guide", "message": "E o relógio?", "lang": "pt-BR",
  "history": [ { "question": "Quais alas existem?", "answer": "…" } ] }

200 { "status": "success", "data": { "answer": "…" } }
400 { "status": "error", "error": { "code": "INVALID_PERSONA" } }   persona fora da lista branca
400 INVALID_REQUEST   pergunta vazia, acima de 500 caracteres, JSON inválido ou corpo acima de 16 KB
405 METHOD_NOT_ALLOWED
```

O `history` é opcional e **nunca é confiado ao cliente**: o servidor descarta itens fora do formato `{ question, answer }`, falas vazias ou acima do limite (500 caracteres na pergunta, 2000 na resposta) e usa só as **3 trocas mais recentes**.

## Como funciona

```
api/                                     fora do webroot (403 no servidor)
├── npc_mock.php                         lista branca, validação da pergunta e do histórico, resposta
└── personas.php                         personas fictícias (no produto: system prompts, só no servidor)
public/npc_chat.php                      controller fino
src/
├── Content/npcs.json                    NPCs: id, rótulo, posição, cor e o NOME da persona
├── Domain/
│   ├── Npc.ts                           valida os NPCs contra o campus; corpo do NPC como obstáculo
│   └── Proximity.ts                     prédio ou NPC mais próximo no alcance (até a parede / até o corpo)
├── Application/TalkToNpc.ts             caso de uso + porta: pergunta + 3 últimas trocas
├── Infrastructure/HttpNpcChatAdapter.ts POST JSON; códigos de erro do contrato
└── Presentation/
    ├── di.ts                            Composition Root (único lugar que cria o adapter)
    ├── Engine3D/Npc3D.tsx               cápsula + rótulo Billboard; vira para o avatar
    └── HUD/NpcDialogModal.tsx           histórico, campo de texto, "pensando…", erros traduzidos
```

| Técnica | Por quê |
| :--- | :--- |
| **Persona por nome, prompt no servidor** | O JSON do front só diz `"persona": "museum_guide"`. Quem fala e o que sabe fica no servidor: nada de prompt no bundle, e mudar a personalidade não exige novo deploy do front. |
| **Lista branca + `INVALID_PERSONA`** | Um cliente adulterado não consegue inventar uma persona (ou mandar um `system` próprio, que é ignorado). O código de erro próprio diferencia "persona proibida" de "pergunta malformada". |
| **Memória curta (3 trocas)** | O bastante para "e o segundo?" fazer sentido, sem crescer o pedido a cada pergunta. A tela mostra a conversa inteira; o caso de uso corta o que vai; o servidor corta de novo. |
| **Validação em dobro** | O caso de uso barra pergunta vazia ou longa antes da rede; o servidor revalida tudo (contando caracteres, não bytes). |
| **NPC como obstáculo, não como prédio** | Para a colisão, o corpo do NPC entra como um "prédio" pequeno; para a proximidade, NPC e prédio continuam separados, cada um com o seu aviso e o seu raio (2 m para NPC, 3 m para prédio). |
| **Conteúdo validado** | NPC fora do mapa, dentro de um prédio, em cima de outro NPC, com cor ou persona fora do formato falha com mensagem clara ao carregar. |
| **Digitar não anda** | Com a conversa aberta, os atalhos e o avatar param; o foco vai direto para o campo. Esc fecha e devolve o foco. |
| **Rótulo em Suspense próprio** | O texto 3D espera a fonte sem esconder o corpo do NPC. |

### Testes

**No Node** (56 testes, incluindo os das PoCs anteriores):

| Arquivo | O que prova |
| :--- | :--- |
| `Npc.spec.ts` | NPCs da demo válidos; erros de formato com mensagem clara; fora do mapa, dentro de prédio e sobreposto recusados; o avatar para no corpo do NPC; ponto de partida livre |
| `Proximity.spec.ts` | distância até o corpo do NPC; raio de 2 m; entre prédio e NPC, vence o mais perto; no campus da demo, o Guia aparece antes da Biblioteca |
| `TalkToNpc.spec.ts` | o caso de uso manda persona, pergunta, idioma e **só as 3 últimas trocas**; pergunta vazia ou longa nem chega à rede; o adapter segue o contrato (400 `INVALID_PERSONA`, erro desconhecido, HTML no lugar de JSON, rede fora) |
| `NpcDialog.spec.tsx` | foco no campo, saudação, trocas na tela, Esc devolve o foco; com 4 trocas o pedido leva 3; erro traduzido sem perder a pergunta; "pensando…" sem envio duplo |
| `InteractionHud.spec.tsx` | **Gherkin**: perto do NPC o aviso é de conversa, E abre a conversa e a pergunta sai com a persona dele; I não abre nada perto de NPC; digitar e/i/h no campo não abre outra janela; fechar e reabrir mantém a conversa |
| `AvatarScene.spec.tsx` | o NPC vira para o avatar perto e fica parado longe; todo NPC tem nome e saudação nos dois idiomas |

**No PHP** (`tests/npc_mock_test.php`, 18 checagens): lista branca e `INVALID_PERSONA`; `system` forjado ignorado; limites da pergunta e do corpo; idioma; o histórico com 5 trocas vira 3; itens malformados descartados; a resposta cita a pergunta anterior.

**No Chrome headless com o PHP de verdade** (`scripts/e2e.mjs`, teclas reais, `php -S`): longe não há aviso; andando em frente o aviso de conversa aparece a menos de 2 m do Guia; E abre a conversa com o foco no campo; a 1ª resposta vem sem histórico e a 2ª **cita a 1ª pergunta**, com o pedido levando a troca anterior; digitar w e s no campo não move o avatar; Esc fecha; persona inventada recebe 400 `INVALID_PERSONA`; ao se afastar o aviso some; nenhum erro e nenhuma requisição externa.

## Achados

1. **"Persona" é dado de segurança, não só de conteúdo.** Se o front mandasse o prompt, qualquer um mudaria a personalidade do NPC pelo DevTools. Mandando só o nome e conferindo numa lista branca, o pior que um cliente adulterado consegue é um 400.
2. **O histórico vem do cliente, então é entrada como qualquer outra.** O servidor não confia na contagem nem no tamanho: corta para 3 e descarta o que estiver fora do formato.
3. **Medir até o corpo, como medimos até a parede.** Raios iguais para prédio e NPC deixariam o aviso do NPC aparecer longe demais; 2 m a partir do corpo é a distância de "chegar para conversar".
4. **O Vite copia `public/` para o `dist/`.** Como o `public/` aqui é o webroot PHP, o `publicDir` fica desligado; senão o endpoint apareceria duplicado dentro do `dist/`.
5. **O `php -S` não serve pastas ocultas.** A saída do build do e2e fica em `e2e-dist/`, sem ponto no nome.

## Demo

Ande com **W** até o **Guia do Museu**: o aviso aparece. Aperte **E**, faça uma pergunta e depois outra: a segunda resposta cita a primeira. A **Astrônoma** fica à direita, perto do Auditório. **Esc** fecha; reabrindo, a conversa continua lá.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify    # fronteiras + tsc + 56 testes + mock PHP + e2e no Chrome headless com php -S (PHP 8.2; PHP_BIN e CHROME_PATH se precisar)
yarn api:dev   # mock PHP em http://localhost:8000
yarn dev       # demo em http://localhost:5173 (o /public vai para o php -S)
```
