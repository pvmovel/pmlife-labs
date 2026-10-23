# Spike: busca semântica (embeddings) a custo zero para o Co-Pilot

## Problema

O Co-Pilot (o tutor de IA do campus) acha os trechos do material com **BM25**, uma busca por palavras (veja o [`spike-zero-cost-ai-gateway`](../spike-zero-cost-ai-gateway)). Ele falha quando o aluno pergunta com outras palavras: "por que existe verão e inverno?" não tem nenhuma palavra do trecho sobre equinócios e solstícios. A busca semântica (embeddings) compara o **sentido**, mas costuma exigir uma API paga ou um servidor com GPU. A hospedagem é compartilhada e o orçamento é zero.

A pergunta do spike: **alguma busca semântica que roda de graça no aparelho do aluno ganha do BM25 o bastante para valer o download?**

## Regra de decisão (aprovada antes de medir)

- **Métrica:** recall@3, a fração das perguntas com o trecho certo entre os 3 primeiros (são os trechos que vão para a IA).
- **Conjunto:** 30 perguntas sobre um curso fictício de astronomia com 26 trechos ([`eval_questions.json`](src/Content/eval_questions.json)):
  - 8 perguntas que repetem termos do trecho (L);
  - 22 paráfrases, do jeito que o aluno pergunta (P).
- **Adota** uma busca semântica só se ela **ganha pelo menos 15 pontos** do BM25 e o **download fica em até 30 MB**. O aluno baixa o modelo na primeira pergunta e depois ele fica em cache.
- **Custo zero:** sem API e sem chave. O modelo roda no navegador e a própria hospedagem serve o arquivo, com nome versionado por causa do cache.

A regra está em código ([`Decision.ts`](src/Domain/Decision.ts)), e o teste dá o veredito.

## Candidatas

| Modelo | O que é | Licença |
| :--- | :--- | :--- |
| `multilingual-e5-small` | Transformer multilíngue pequeno (384 dimensões), int8 | MIT |
| `paraphrase-multilingual-MiniLM-L12-v2` | Transformer multilíngue treinado em paráfrases, int8 | Apache 2.0 |
| `static-similarity-mrl-multilingual-v1` | **Sem rede neural**: o vetor da frase é a média dos vetores das palavras. Treinado com Matryoshka, então dá para guardar só as primeiras dimensões | Apache 2.0 |

Cada um entra sozinho e também em **busca híbrida**: o BM25 e o vetor combinados por posição (Reciprocal Rank Fusion, k = 60).

## Resultado

O `yarn verify` imprime esta tabela, recalculada a partir dos vetores versionados:

| Abordagem | recall@3 | Paráfrases | Download | Ganho |
| :--- | ---: | ---: | ---: | ---: |
| **BM25 (hoje)** | **24/30 = 80,0%** | 16/22 | 0 | referência |
| e5-small | 28/30 = 93,3% | 20/22 | 135,4 MB | +13,3 |
| e5-small + BM25 | 27/30 = 90,0% | 19/22 | 135,4 MB | +10,0 |
| MiniLM-L12 | 27/30 = 90,0% | 19/22 | 135,4 MB | +10,0 |
| MiniLM-L12 + BM25 | 28/30 = 93,3% | 20/22 | 135,4 MB | +13,3 |
| estático, 1024 dimensões | 25/30 = 83,3% | 17/22 | 436,2 MB | +3,3 |
| estático, 256 dimensões, int8 | 26/30 = 86,7% | 18/22 | 30,1 MB | +6,7 |
| estático 256 int8 + BM25 | 26/30 = 86,7% | 18/22 | 30,1 MB | +6,7 |
| e5-small enxugado (teto, estimado) | 28/30 = 93,3% | 20/22 | ~29 MB | +13,3 |

**Veredito: fica o BM25.** Nenhuma busca semântica ganha 15 pontos, nem mesmo os modelos de 135 MB que passam do limite de download.

No material real do produto (privado, fora deste repositório), com 22 perguntas sobre o guia e o glossário, o veredito foi o mesmo:

- BM25 com 86%;
- o melhor modelo com +9 pontos;
- a pergunta-chave do Gherkin ("como cada cliente só vê os próprios dados no banco?") já vem no top 3 com o BM25.

## Por que o ganho é pequeno

- **O material é pequeno e de assunto concentrado.** Com 26 trechos, quase toda paráfrase ainda divide alguma palavra com o trecho certo ("Lua", "estrelas", "telescópio"), e o BM25 acerta. Os embeddings brilham com milhares de documentos e vocabulário variado.
- **Os erros que sobram são de conhecimento, não de vocabulário.** "Estrelas cadentes" (pergunta 16) é o nome popular de meteoros. Nenhum modelo pequeno, nem o BM25, liga um ao outro sem o termo no texto. Só o estático sozinho, com 256 dimensões, acerta a 16, e erra outras quatro.
- **O que funciona melhor e custa zero é escrever o material com os termos do aluno:** "meteoros (as estrelas cadentes)". Assim o BM25 acerta e nenhum aluno precisa baixar nada.

## Custo de cada opção

| | BM25 | e5-small / MiniLM | estático 256 int8 |
| :--- | :--- | :--- | :--- |
| Download na 1ª pergunta | 0 (vem no bundle) | 135 MB (int8, com tokenizer) | 30 MB |
| Tempo por pergunta (notebook, Node) | < 1 ms | 15 a 27 ms | < 1 ms |
| Dependência | nenhuma | `@huggingface/transformers` + ONNX Runtime Web (WASM) | tokenizer de 8 kB + tabela |

**Os dois caminhos para caber em 30 MB, se um dia o ganho justificar:**

1. **Enxugar o vocabulário do `e5-small`.** O modelo int8 tem 118 MB, e 96 MB disso são a tabela de 250 mil tokens de dezenas de línguas. Mantendo só os ~20 mil tokens que o português usa (as peças da segmentação de uma lista grande de palavras), sobram ~29 MB. A segmentação ótima de cada palavra coberta continua disponível, então os vetores dessas palavras não mudam. Por isso o teto do enxugado é o recall do completo. Como o completo já não passa da regra, o enxugado não foi gerado.
2. **Usar o modelo estático cortado em 256 dimensões e int8.** Fica com 30,1 MB (e menos ainda com o mesmo enxugamento de vocabulário). O teste mostra que o corte e a quantização não mudam o acerto, mas o modelo estático é o mais fraco.

## O que o `verify` prova

**Peças (Vitest):**
- cosseno;
- corte Matryoshka;
- ordenação com empate estável;
- fusão RRF;
- recall@k, com a separação das paráfrases;
- regra de decisão: adota quem cabe e ganha 15 pontos ou mais; com 14,9 pontos, fica o BM25.

**Avaliação (Vitest):**
- as 30 perguntas e os 26 trechos, com todo trecho esperado existindo no material;
- cada arquivo de vetores com um vetor normalizado por trecho e por pergunta;
- o recall@3 de cada abordagem e o veredito, com os números fixados no teste: uma mudança no material ou nos vetores que altere o resultado quebra o CI;
- **fronteiras (ESLint):** o Domain é TypeScript puro.

## Como rodar

```bash
yarn install --frozen-lockfile
yarn verify            # ESLint + tsc + 18 testes; imprime a tabela de recall@3 e o veredito
```

Para recalcular os vetores com os modelos reais (uma vez, fora do CI: ~650 MB de download do Hugging Face, de graça e sem chave):

```bash
cd eval
yarn install --frozen-lockfile
yarn vectors           # grava ../src/Content/vectors/*.json e mede download e tempo por pergunta
```

## Estrutura

```text
src/
├── Content/
│   ├── knowledge_base.json      26 trechos do curso fictício
│   ├── eval_questions.json      as 30 perguntas e os trechos esperados
│   └── vectors/                 vetores pré-calculados por modelo (gerados pelo eval/)
├── Domain/
│   ├── Bm25.ts                  a mesma busca lexical do Co-Pilot
│   ├── Retrieval.ts             cosseno, Matryoshka, RRF, recall@k
│   └── Decision.ts              a regra do DoR em código
└── tests/                       peças + avaliação (imprime a tabela)
eval/compute-vectors.mjs         roda os modelos (transformers.js em ONNX) e grava os vetores
```

## Sanitização

- O material e as perguntas são de um curso fictício.
- Nenhuma credencial, nenhuma chave de API e nenhum domínio.
- Os vetores são só números derivados do texto fictício.
- A avaliação no material real fica no repositório privado.
