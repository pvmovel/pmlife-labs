# Spike: totem de vídeo além do YouTube (Vimeo, Panda Video e Bunny Stream)

**Pergunta:** o totem de vídeo da sala 3D toca hoje só o YouTube. Quem já dá aula online guarda os vídeos no Vimeo, no Panda Video ou no Bunny Stream. Dá para aceitar essas plataformas do mesmo jeito? O documento continuaria guardando só os IDs, nunca o link nem HTML, e o player oficial avisaria "pronto" ou o erro sem nenhum script da plataforma na página.

**Resposta:** sim, as três entram, com uma estratégia por plataforma (Open/Closed). O YouTube vira a primeira estratégia, sem mudar o comportamento. Os protocolos foram medidos no Chrome com os players reais e vídeos públicos de exemplo.

## Como foi medido
`scripts/measure.mjs` importa as estratégias de `src/Domain/VideoSource.ts` e, para cada caso, faz quatro coisas:
- abre uma página local com o iframe montado pela estratégia;
- repete a mensagem de "ouvir" como a tela faz;
- registra o status HTTP do player, o primeiro sinal lido e quanto ele demorou;
- registra os cookies antes e depois do play (só o domínio e o nome).

Cada caso roda num Chrome novo, para que um caso não leve cookies para o outro. A saída fica em [`results/medicao.json`](results/medicao.json).

Vídeos usados, todos públicos:

| Plataforma | Vídeo |
| :--- | :--- |
| YouTube | o da demonstração da API |
| Vimeo | o `76979871`, do próprio Vimeo |
| Panda Video | o do exemplo da documentação oficial |
| Bunny Stream | o da demo oficial (`BunnyWay/examples`), cujos IDs a própria Bunny publica |

## Resultado (Chrome 139)

| Plataforma | Link aceito | O documento guarda | "Pronto" | Erro | Vídeo inexistente | Cookies (com o play) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| YouTube | `youtu.be`, `watch?v=`, `embed`, `shorts`, `live` | `id` | `onReady` (~1,0 s), depois do `listening` | `onError` com código | erro 100/150 | nenhum (`youtube-nocookie.com`) |
| Vimeo | `vimeo.com/<id>[/<h>]`, `player.vimeo.com/video/<id>?h=`, painel, canais, vitrines | `id` e `hash` (o `h` do não listado) | `{"event":"ready"}` sozinho (~1,5 s) | `{"event":"error","data":{"name"}}` | HTTP 404 e `NotFoundError` | com `dnt=1`: só `__cf_bm`, `cf_clearance` e `__cf_ob` (Cloudflare contra robôs); sem `dnt=1`, também `vuid` e `player` |
| Panda Video | `player-vz-<zona>.tv.pandavideo.com.br/embed/?v=<uuid>` | `zone` e `id` | `{"message":"panda_ready"}` sozinho (~1,5 s) | não manda | toca um aviso de 6 s do próprio player, sem erro | `AWSALBCORS` (balanceador do domínio de métricas) |
| Bunny Stream | `player.` ou `iframe.mediadelivery.net/{embed,play}/<biblioteca>/<guid>` | `library`, `id` e `legacy` (player antigo) | `player.js` `event: "ready"` sozinho (~1,1 s) | `error`, depois do `addEventListener` | HTTP 404, nenhuma mensagem: aviso pelo prazo | nenhum |

### O que os testes provam (`yarn verify`, sem internet)
- **Links:** 17 links aceitos e 16 recusados ([`cases/links.json`](cases/links.json)). Os recusados incluem domínio parecido, HTML colado, o link do painel do Panda, usuário, senha, porta e plataformas fora da lista (Hotmart, Dailymotion).
- **Documento:** 17 casos de conformidade ([`cases/documents.json`](cases/documents.json)). O `videoId` de antes continua valendo como YouTube, sem conversão. Os dois formatos juntos, campo a mais, link no lugar do ID e `legacy: false` são recusados, com o mesmo código de erro que os dois validadores (TypeScript e PHP) vão usar.
- **Mensagens reais:** as gravadas na medição são lidas pela estratégia certa, e nenhuma estratégia lê a mensagem de outra plataforma. O teste pegou um caso real: o Vimeo e o Bunny mandam os dois `event: "ready"`. A tela já separa os dois pela origem, e a leitura do Vimeo também passou a recusar o protocolo `player.js`.
- **Privacidade:** nenhum cookie de rastreamento conhecido depois do play.
- **Tela:** a mesma máquina de estados da US38 (pronto, erro com motivo, prazo só enquanto carrega). O link de "abrir na plataforma" só aparece no YouTube e no Vimeo, que têm página pública.

## O que não deu para medir (fica para a homolog)
- **Play do Vimeo:** o Vimeo desafia navegadores automatizados com o Cloudflare Turnstile. O "pronto" chega, mas o play no robô termina em `PlaybackError` ("questão de direitos"). Na demo publicada, num navegador comum, o play deve ser conferido à mão.
- **Domínio restrito e vídeo privado:** não há vídeo público com essa trava. Pela documentação:
  - **Panda e Bunny:** recusam pelo `Referer` (o Bunny com 403).
  - **Vimeo:** avisa um erro.
  - **No totem:** se a plataforma avisa, aparece o aviso com o motivo; se não avisa, aparece o aviso pelo prazo. O editor do mundo deve lembrar o master de liberar o domínio do PMLife na plataforma.
- **Vídeos com DRM ou token assinado** (Panda com DRM, Bunny com token): ficam fora. Só tocam com uma chave do servidor da plataforma. O vídeo protegido de um player antigo do Bunny, testado à parte, não mandou nenhuma mensagem e caiu no aviso pelo prazo.

## Veredito
1. **Entram o Vimeo, o Panda Video e o Bunny Stream**, cada um como uma estratégia em `src/Domain`, ao lado do YouTube.
2. **O documento guarda:**
   - o formato novo, `video: {provider, ...ids}`: `{provider: "vimeo", id, hash?}`, `{provider: "panda", zone, id}` ou `{provider: "bunny", library, id, legacy?}`;
   - o `videoId` de antes, que continua como YouTube;
   - erros com os códigos `VIDEO_MISSING`, `VIDEO_BOTH`, `VIDEO_PROVIDER_UNKNOWN` e `VIDEO_INVALID`.
3. **Privacidade:** o Vimeo vai sempre com `dnt=1`. O Panda grava um cookie técnico de balanceador, e os termos de uso devem citar as plataformas e dizer que cada uma tem as próprias regras.
4. **Panda sem erro:** o vídeo inexistente mostra o aviso dentro do player do Panda. A tela não tem como saber e fica em "pronto", o que é aceitável, porque o aluno vê o aviso.
5. **Bunny no player antigo:** o player antigo (`iframe.mediadelivery.net`) sai do ar no começo de 2027. O documento guarda `legacy` só para tocar como foi colado, e o editor pode sugerir o link novo.
6. **Custo zero:** só iframes oficiais, nenhum SDK carregado na página e nenhuma chave de API.

## Como rodar
```bash
yarn install
yarn verify     # lint (com as fronteiras do Domain), typecheck e os testes, sem internet
yarn measure    # mede os players reais no Chrome (precisa de internet) e grava results/medicao.json
yarn dev        # a demo
```
