# Spike: registro declarativo das ferramentas de ensino

## O que este spike prova

As ferramentas de ensino do PMLife (quiz, flashcards, leitor de PDF, aulas ao vivo e as outras) vão ser **objetos da sala**, como o quadro e o totem de vídeo, cada um num tipo. Este spike prova a base delas (US57):

| Pergunta | Resposta |
| :--- | :--- |
| Como um tipo novo entra **sem mexer no motor**? | Um JSON (`src/Content/tool-types.json`) descreve cada tipo: os campos próprios e o formato de cada um, se fecha uma missão, se é alvo da tecla E e o que o E faz. Ferramenta nova = uma entrada no JSON. |
| Como o editor (TypeScript) e o servidor (PHP) **não divergem**? | Os dois validadores leem **o mesmo arquivo** e só implementam os **formatos** (texto, inteiro com faixa, lista fechada, vídeo, ID do YouTube, referência a um arquivo do banco). Os 19 casos de conformidade dão o mesmo resultado nos dois. |
| O totem de vídeo de hoje **continua igual**? | Sim: ele vira uma entrada do registro, com os mesmos códigos de problema do produto (os casos 079 a 085 foram portados), e validar não muda o documento. |
| E o que é secreto ou grande? | O documento guarda só a **referência** (`fileRef`): o gabarito do quiz e os arquivos ficam no banco da instituição. |

Um **tipo de exemplo** (`fixtures/example-type.json`, só nos testes) mostra o caminho: um quiz que fecha uma missão, com a nota de corte, o modo e a referência do gabarito. Com ele no registro, o editor passa a oferecê-lo e os dois validadores o aceitam; sem ele, o mesmo documento dá `WALL_ITEM_KIND_UNKNOWN`. Os outros tipos não mudam de resultado.

## Como funciona

```text
src/Content/tool-types.json      o registro da plataforma: o quadro e o totem de vídeo
fixtures/example-type.json       o tipo de exemplo (só nos testes): um quiz que fecha uma missão
src/Domain/ToolRegistry.ts       TypeScript puro: confere o registro e valida os objetos com ele
src/Domain/Video.ts              o formato videoRef (igual ao do totem do produto)
php/src/ToolRegistry.php         o mesmo, no PHP 8.2, lendo o mesmo JSON
cases/*.json                     19 casos de conformidade, rodados nos dois lados
```

| Técnica | Por quê |
| :--- | :--- |
| **Declarativo, não código por tipo** | Escrever cada ferramenta duas vezes (TypeScript e PHP) é onde os dois lados divergem. Com o tipo em dados, só os formatos são código, e eles são poucos e estáveis. |
| **A forma comum fica no motor** | `id`, `kind`, `width`, `textKey` e o lugar (na parede ou no chão, US75) valem para todos e seguem a mesma ordem e os mesmos códigos do validador do produto. Um tipo não pode redefinir esses campos. |
| **A missão é uma regra do tipo** | `quest: none` (o totem: `questId` é recusado), `optional` ou `required` (o quiz: sem missão, com uma que não existe ou com a de outro prédio é recusado). |
| **A ação da tecla E é dado** | `none` (o quadro), `video` (o totem) ou `modal` (a janela do tipo). A tela abre a janela do tipo sem saber qual é. |
| **O registro é conferido** | Tipo repetido, formato desconhecido, faixa invertida, lista vazia, campo comum redefinido e ação sem alvo: o registro não sobe, e o erro diz o tipo e o campo (as mesmas mensagens nos dois lados). |

### Testes

- **TypeScript** (`yarn test`, 25 testes):
  - os 19 casos;
  - o editor oferecendo o tipo novo e a ação de cada tipo;
  - o tipo novo sem mudar nenhum resultado dos tipos de antes;
  - o documento intacto depois de validar;
  - os registros malformados.
- **PHP 8.2** (`php php/verify.php`): os mesmos 19 casos e as mesmas regras do registro.

```bash
yarn install --frozen-lockfile
yarn verify   # ESLint + tsc + testes + php php/verify.php
```

## Limites

- **Só a validação e o registro.** O desenho de cada tipo na sala 3D e a janela da tecla E ficam no produto (US57, Etapa 2), lidos do mesmo registro.
- **As regras de posição da US75** (5 por parede, o corredor da porta, a passagem livre) já estão no produto e valem para todo tipo. Aqui só a forma comum (os campos do lugar) é conferida.
- **No produto:**
  - a missão de uma sala pode ser fechada por uma estação **ou** por uma ferramenta com `questId`, e a regra "missão sem estação" passa a aceitar as duas;
  - o registro vira `src/Content/Platform/tool-types.json`, lido pelo validador TypeScript, pelo PHP e pelo editor do mundo.
