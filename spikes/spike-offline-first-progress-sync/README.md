# Spike: o mesmo progresso em dois aparelhos, mesmo offline

## Problema

O aluno conclui missões no celular no ônibus (sem internet) e no computador da escola. Ele espera ver o mesmo progresso nos dois, sem perder nada e **sem ganhar XP em dobro**. Sincronização é onde aplicativos costumam errar:

- "o último a gravar vence" apaga o que o outro aparelho fez offline;
- somar o XP de cada envio conta em dobro quando a mesma conclusão chega duas vezes;
- uma resposta perdida na rede (o servidor gravou, mas o aparelho não soube) faz o aparelho reenviar;
- quem chama a API direto pode inventar missões para ganhar XP.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Regra de merge | **União das missões concluídas** | O progresso é monotônico: uma missão concluída nunca "desconclui". A união é comutativa, associativa e idempotente: em qualquer ordem e com qualquer repetição, todos os aparelhos chegam ao mesmo estado. Não há conflito para resolver. |
| XP | **Sempre derivado** do catálogo: a soma das recompensas das missões concluídas | O XP nunca é somado nem guardado: não tem como contar em dobro. |
| Idempotência | Chave por **aluno + trilha + missão** | No servidor, é a chave primária da tabela: gravar de novo não faz nada. |
| Validação | O servidor só aceita missões do **catálogo** da trilha | Uma missão inventada é recusada, sai da fila e nunca vale XP. |
| Visitante ➔ conta | As missões feitas como visitante **entram na conta** ao fazer login | Não se perde nada do que o aluno fez antes de criar a conta. |

## Solução

```text
src/
├── Domain/
│   ├── ProgressMerge.ts       união, XP derivado do catálogo, chave de idempotência (TypeScript puro)
│   └── Outbox.ts              fila local: só esvazia o que o servidor CONFIRMOU
├── Application/
│   ├── Ports/ProgressServer.ts   envia um lote, recebe o estado do servidor já unido
│   └── UseCases/SyncProgress.ts  um aparelho: concluir (vale offline), sincronizar, incorporar o visitante
├── Infrastructure/
│   ├── InMemoryProgressServer.ts a mesma regra do endpoint PHP do produto (chave única + catálogo)
│   └── FlakyLink.ts              a rede: online, offline ou "perde a resposta" (grava, mas a resposta não volta)
└── Presentation/                 demo: dois aparelhos e o servidor
```

O ciclo de uma conclusão:

1. O aluno conclui a missão: ela **vale na hora** no aparelho (XP derivado) e entra na fila com a chave de idempotência.
2. Quando há rede, o aparelho manda **a fila inteira** num lote. O servidor grava o que é novo, ignora o que já tem, recusa o que não está no catálogo e devolve **todas** as missões do aluno.
3. O aparelho une o que o servidor sabe com o que ele sabe e **só tira da fila o que foi confirmado**. Se a resposta se perder, nada sai da fila, e o próximo envio repete o lote sem efeito no servidor.

No PMLife, a fila e as missões ficam no SQLite WASM do navegador (US18); aqui ficam em memória, com `snapshot()` simulando fechar e reabrir a aba.

## O que o `verify` prova

**Domínio (Vitest):** união com repetidas e ordem preservada; comutativa, associativa e idempotente; XP derivado, com cada missão uma vez; missão fora do catálogo sem XP; recompensa inválida recusada no catálogo; fila sem duplicar, só confirmadas saem, reabre com a fila gravada.

**Convergência (Vitest), os 3 cenários do Gherkin:**
- o celular conclui e o computador vê depois de sincronizar;
- offline, a missão vale na hora, fica na fila e é enviada quando a rede volta;
- **a resposta se perde, o aparelho reenvia e o servidor conta uma vez**.

E também: a mesma missão nos dois aparelhos offline; a aba fechada com a fila cheia; o visitante que entra na conta; missão inventada recusada; alunos separados.

E por fim **300 sequências aleatórias** (com semente, para reproduzir) de 3 aparelhos, com conclusões em qualquer ordem, rede caindo, respostas perdidas e abas fechadas no meio. Com a rede de volta, todos chegam às mesmas missões e ao XP certo, sem fila sobrando, e o servidor fica com uma linha por missão.

**Os testes pegam o erro clássico:** numa mutação que esvazia a fila **antes** da confirmação do servidor, 3 testes falham, inclusive o das sequências aleatórias.

**Demo no Chrome headless (`scripts/e2e.mjs`):** o celular offline conclui 2 missões; o computador de visitante entra na conta; o celular sincroniza com a resposta perdida e reenvia ao voltar a rede; o servidor recebe o lote duas vezes e mantém uma linha por missão; os dois aparelhos convergem (4 missões, 2.500 XP).

## Achados

1. **A fila só pode esvaziar com a confirmação.** Tirar da fila ao enviar parece igual, e passa no caso feliz. Mas, com a rede caindo no meio, a missão some do servidor para sempre. Os testes de convergência pegam isso.
2. **A chave é recalculada no servidor.** O servidor não confia na chave que o aparelho manda: ele a refaz com o aluno da sessão, a trilha e a missão. Assim, um cliente não grava linha para outro aluno.
3. **Responder o estado inteiro simplifica tudo.** Com o servidor devolvendo todas as missões do aluno a cada lote, um envio vazio serve para "buscar o que mudou". O mesmo caminho atende ao abrir a página, ao voltar a rede e ao entrar na conta.
4. **O XP guardado no navegador vira cache.** No PMLife o snapshot local tem o campo `xp`; com o XP derivado, ele passa a ser só um valor recalculado do catálogo, nunca uma fonte da verdade.

## Demo

Ponha o celular **Offline** e conclua missões: o XP sobe na hora e a fila cresce. No computador (visitante), conclua uma missão e clique **Entrar na conta**. Escolha **Perde a resposta** no celular e sincronize: o servidor grava, mas a fila continua. Volte ao **Online** e veja o reenvio sem linhas a mais. Sincronize os dois: o mesmo progresso nos dois aparelhos.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 17 testes (com 300 sequências aleatórias) + e2e da demo no Chrome headless
yarn dev      # demo em http://localhost:5173
```
