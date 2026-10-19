# Spike: gateway de IA a custo zero (PHP) + RAG lexical (TypeScript)

## Problema

Um tutor de IA num curso online parece exigir servidor de IA, banco vetorial e cartão de crédito. Nesta fase o projeto roda numa hospedagem compartilhada (PHP 8.2 + MySQL, sem Node no servidor) e **não pode ter custo**. Além disso, um endpoint de IA público é alvo fácil:

- **o system prompt** não pode ir do navegador (qualquer um o trocaria);
- **a cota gratuita** acaba em minutos se alguém disparar perguntas em série;
- **o provedor cai** (cota, instabilidade), e a página não pode quebrar junto.

## Solução

```
public/ai_chat.php                 controller fino (o resto do item responde 403 no servidor)
src/
├── env-loader.php                 chaves e limites num arquivo FORA do webroot (técnica do spike de credenciais)
├── bootstrap.php                  monta o gateway a partir do env; IP real atrás do Cloudflare
└── Ai/
    ├── ChatRequest.php            { persona, message, context[] }: o resto (inclusive "system") é ignorado
    ├── ChatGateway.php            valida ➔ rate limit ➔ prompt da persona + trechos ➔ provedor
    ├── Personas/tutor.php         o system prompt (fictício), só no servidor
    ├── GeminiProvider.php         generateContent, chave no header
    ├── GroqProvider.php           chat/completions (formato OpenAI)
    ├── FailoverProvider.php       Gemini ➔ Groq
    ├── RateLimiter.php            por IP (minuto e dia) + teto global diário; IP guardado só como hash
    ├── FileRateLimitStore.php     contadores em arquivo com flock (demo do labs, sem banco novo)
    └── PdoRateLimitStore.php      contadores em MySQL (o store do produto) + migrations/mysql/001
scripts/purge-rate-limit.php       Cron diário: apaga os contadores de dias anteriores
scripts/check-providers.php        saúde de cada provedor, isoladamente (uma pergunta mínima a cada um)
web/                               lado TS: BM25 sobre o material, caso de uso, adapters e o widget
```

| Peça | Como funciona |
| :--- | :--- |
| **RAG lexical (BM25)** | A busca roda no navegador, em TypeScript puro: tokeniza sem acento e sem stopwords, pontua com BM25 e manda os 3 trechos mais relevantes. Sem embeddings nem banco vetorial: custo zero. |
| **System prompt no servidor** | O cliente escolhe só o nome da persona. Um campo `system` forjado é ignorado: o provedor recebe sempre o prompt do servidor. O prompt manda tratar os trechos como dados, não como instruções. |
| **Rate limit antes da IA** | Pergunta barrada (429 `RATE_LIMITED`) não chama provedor nenhum. Há limite por IP (por minuto e por dia) e um **teto global diário**, que protege a cota mesmo se alguém forjar o IP. |
| **Failover** | Se o Gemini falhar (cota, rede, resposta vazia), a Groq responde. Com os dois fora: 503 `AI_UNAVAILABLE`, sem detalhe interno na resposta (o detalhe vai para o log). |
| **Limites da hospedagem** | Sem streaming; timeout **total** de 12 s por provedor, para os dois juntos (24 s no pior caso) caberem no `max_execution_time` (~30 s); pergunta de até 500 caracteres e até 4 trechos de 700. |
| **Free tier, sem billing** | Chaves e modelos no env (`GEMINI_MODEL`, `GROQ_MODEL`), conferidos nas páginas oficiais de modelos. Padrões: `gemini-3.5-flash-lite` e `openai/gpt-oss-20b` (modelo de raciocínio: `reasoning_effort: low` e só a resposta final). |
| **Diagnóstico e saúde** | O log do servidor diz o motivo de cada falha (`groq: HTTP 404 model_not_found`, `gemini: HTTP 429 RESOURCE_EXHAUSTED`, `gemini: timeout de 12 s (curl 28)`), sem chave. `scripts/check-providers.php` testa **cada provedor isoladamente**: o failover esconde a Groq enquanto o Gemini responde. |

### O que o `verify` prova

**PHP 8.2** (`tests/run.php`, sem gastar cota):

- **System prompt protegido** (Gherkin): pedido com `"system"` forjado é atendido, e o provedor recebe só o prompt da persona; o texto forjado não chega a lugar nenhum.
- **Proteção de cota** (Gherkin): a 6ª pergunta do mesmo IP no minuto recebe 429 `RATE_LIMITED` **sem chamar o provedor**; outro IP passa; no minuto seguinte volta; limite diário por IP; teto global barra até IPs novos.
- Validação: JSON inválido, persona desconhecida, mensagem vazia ou longa, contexto grande ➔ 400 sem chamar a IA e sem gastar o limite.
- Failover e formato exato das chamadas ao Gemini e à Groq (modelo, chave no header, system prompt, limite de tokens, timeout).
- Store em arquivo e **store MySQL** (no CI, contra um MySQL real): contador atômico, limpeza só dos dias anteriores, IP só como hash.
- **Ponta a ponta HTTP**: `php -S` servindo o `ai_chat.php` e um Gemini e uma Groq falsos em outro processo. O Gemini responde 429, a Groq responde pelo cURL de verdade, chega a ela o prompt do servidor (nunca o forjado), a pergunta com SQL chega intacta e a 3ª pergunta no minuto recebe 429.

**TypeScript** (14 testes): BM25 acha o trecho certo e ignora acento e maiúsculas; pergunta fora do material não traz trecho; o caso de uso manda persona, pergunta e até 3 trechos (**Gherkin: busca fundamentada**) e nunca um system prompt; o adapter traduz o envelope e os erros em códigos estáveis; o widget mostra resposta, provedor, aviso de IA e trechos.

## Achados

1. **Os limites do free tier não são fixos.** O Google não publica números fixos de requisições do free tier (remete ao AI Studio de cada projeto) e os modelos mudam: a série Gemini 2.0 já foi desligada. Por isso modelo e chave ficam no env, e a proteção de cota é nossa (limite por IP e teto global), não do provedor.
2. **Atrás do Cloudflare, o IP do visitante vem em `CF-Connecting-IP`.** `REMOTE_ADDR` é o IP do próprio Cloudflare: sem isso, todos os visitantes dividiriam o mesmo limite. O cabeçalho pode ser forjado por quem acessar o servidor direto, e é para isso que existe o teto global.
3. **Modelo de "raciocínio" pode devolver texto vazio.** Ao estourar o limite de tokens pensando, a resposta vem sem texto. O provedor trata isso como falha, e o failover entra.
4. **A limpeza do Cron comparava janelas pelo prefixo.** A primeira versão apagaria também as janelas diárias de hoje (`d:` vem antes de `m:` na ordem alfabética), zerando o limite diário toda madrugada. O teste do store pegou o erro, e a limpeza agora compara só a data.
5. **mod_security sem gastar cota.** O smoke test do deploy manda ao servidor real um pedido **inválido de propósito, com SQL na pergunta**, e espera o nosso `400 INVALID_REQUEST`. Isso prova que o endpoint está no ar, que o env carregou e que o WAF da hospedagem não barrou o SQL.
6. **O provedor reserva só foi testado no dia em que precisou.** Nas primeiras horas no ar, o Gemini respondia sempre, e a Groq nunca era chamada. No primeiro tropeço do Gemini (sem resposta em 20 s), a Groq devolveu **404**: o Llama 3.1 8B, o modelo padrão, **saiu do free tier da Groq em 16/08/2026** e só existe para contas enterprise. Correções: padrão `openai/gpt-oss-20b`, log com o motivo de cada falha e a verificação de saúde que testa os dois provedores separadamente.
7. **Timeout de cada provedor × tempo do PHP.** Com 20 s para cada, um Gemini lento consumia o tempo todo, e o PHP (limite de ~30 s) morria antes de a Groq responder: o failover não salvava ninguém. Com 12 s cada, o pior caso é 24 s. Um teste garante essa soma.
8. **Contexto vindo do cliente não é confiável.** O RAG roda no navegador, então os "trechos" podem ser forjados. O tamanho é limitado e o prompt do servidor manda tratá-los como dados; no produto, a mesma busca pode rodar também no servidor.

## Demo

Faça uma pergunta sobre o Clube de Astronomia (curso fictício) ou clique num exemplo: aparecem a resposta, **quem respondeu** (Gemini ou Groq) e os trechos do material usados. A demo tem limite de perguntas por minuto e por dia; passando dele, a mensagem pede para esperar.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify      # fronteiras + tsc + 14 testes TS + testes PHP (precisa de PHP 8.2 com curl; MySQL opcional via SPIKE_MYSQL_*)
yarn api:dev     # php -S na porta 8000 (com ~/labs.development.env.php: copie config/env.example.php)
php scripts/check-providers.php ~/labs.development.env.php   # saúde de cada provedor (gasta 1 pergunta de cada)
yarn dev         # demo em http://localhost:5173
```
