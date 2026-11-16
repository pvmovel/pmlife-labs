# PoC: quiz corrigido no servidor

## Problema

Numa plataforma de ensino com cidades 3D, a missão de uma fase se concluía com um clique em "Concluir". Como o certificado da plataforma é verificável em público, a nota que leva a ele precisa ser confiável:
- **O gabarito não pode chegar ao navegador:** o que chega ao navegador, qualquer pessoa lê.
- **Não dá para sortear até cair em questões fáceis:** se cada abertura do quiz sorteia de novo, basta fechar e abrir.
- **A nota precisa ser conferível:** dá para refazer a prova de uma tentativa e entender a nota dela.
- **O teclado basta:** a ordenação costuma depender de arrastar com o mouse.
- **Custo zero:** só o PHP e o MySQL da hospedagem compartilhada (MySQL 5.7, sem CTE nem window functions).

## Decisões (do Pablo, 2026-11-13 e 2026-11-16)

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Onde fica o gabarito | O banco de questões e o gabarito ficam **no MySQL**; o documento do curso guarda só a referência do quiz. O servidor sorteia, embaralha e corrige. | O navegador nunca recebe o gabarito, nem a justificativa antes do envio. |
| Sorteio | **N de X** por tentativa (5 de 20 na demo), com as alternativas, os itens e as opções das lacunas embaralhados. A tentativa guarda **só a semente**. | A correção refaz o sorteio pela semente e só conta as questões sorteadas; uma auditoria refaz a prova inteira. |
| Tentativa aberta | Abrir de novo **continua a mesma tentativa**, com as mesmas questões, até ela ser enviada. | Fechar e abrir não sorteia outras questões. |
| Formatos | Escolha única, múltipla, **verdadeiro ou falso com a justificativa**, **lacunas** e **ordenação** (com Alt+↑/↓ ou botões). | Os formatos da primeira entrega, todos pelo teclado. |
| Pontuação | **Tudo ou nada** por questão (decisão de 2026-11-16). | É a mesma regra nos 5 formatos, simples de explicar na nota do certificado, e na múltipla marcar todas não passa. |
| Devolutiva | A nota, **certo ou errado** em cada questão e a **justificativa** de cada uma que tiver, **sem a resposta certa** das que errou (decisão de 2026-11-16). | Ensina sem entregar o banco de questões para a próxima tentativa, que sorteia de novo. |
| Configuração | Nota de corte (padrão 70%), tentativas (padrão sem limite) e espera depois de reprovar (padrão 10 min; 60 s na demo). | O autor ajusta cada quiz. |
| XP | **Uma vez**, na primeira aprovação; refazer depois não soma. | É a regra das missões de hoje: no produto, a primeira aprovação conclui a missão. |
| Segurança | O aluno vem **só da sessão**, todo POST exige JSON e o **token CSRF** da sessão, e cada consulta de tentativa leva o aluno. | Ninguém envia a tentativa de outra pessoa nem uma nota inventada. |

## Solução

```text
src/quiz.ts                 a nota e a regra das tentativas, em TypeScript puro (sem o gabarito)
src/quiz.test.ts            os casos de cases/ e o que a tela decide sozinha, no Node 24
cases/                      os casos que os dois lados rodam (a nota e as tentativas)
php/Quiz/AttemptRules.php   a mesma nota e a mesma regra em PHP
php/Quiz/Draw.php           o sorteio pela semente: SHA-256 de "semente:etiqueta:id", do menor para o maior
php/Quiz/Graders.php        a correção, uma estratégia por formato (Strategy): formato novo = classe nova
php/Quiz/QuizStore.php      o repositório (PDO, só SQL do MySQL 5.7)
php/Quiz/QuizService.php    abrir (sorteia ou continua), enviar (refaz o sorteio e corrige) e o estado
public/quiz.php             a API, no formato {status, data} do produto, com CSRF
public/index.html           a demo
public/app.v1.js            a janela do quiz, 100% pelo teclado (o nome tem a versão por causa do cache da CDN)
public/quiz-view.v1.js      o que a tela decide sozinha: mover na ordenação, o que está respondido, a espera
migrations/mysql/           as tabelas poc_quiz* e o quiz de exemplo (20 questões fictícias de astronomia)
scripts/verify.php          os casos, o sorteio, a correção, o serviço no MySQL e a API de verdade
scripts/e2e.mjs             o quiz inteiro no Chrome, só pelo teclado, e a janela num celular
scripts/e2e-router.php      o roteador do php -S do e2e (o gabarito só com QUIZ_E2E=1, nunca no ar)
```

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Sorteio N de X e embaralhamento | Cada tentativa traz 5 questões sorteadas pelo servidor, com as alternativas embaralhadas. Em 2.000 sorteios, cada questão aparece perto das 500 vezes esperadas, e as 2.000 provas saem diferentes. |
| Gabarito nunca vai ao navegador | A resposta da abertura não tem o gabarito, a justificativa nem a semente. |
| Aprovação dá XP uma vez | 4 de 5 com a nota de corte de 70% aprova e dá o XP; uma nova aprovação não soma. |
| Espera entre tentativas | Reprovado e tentando de novo 1 minuto depois, faltam 9 minutos; a página mostra a contagem com o botão desligado. |

### Um defeito que o e2e achou

Quando a reprovação caía **no mesmo segundo** da aprovação anterior, a regra escolhia a tentativa errada como "a última", e a espera sumia. Agora o empate fica com a tentativa aberta depois, nos dois lados, e o caso `012` prova isso.

## Como testar

```bash
yarn install --frozen-lockfile
node --no-warnings --test src/quiz.test.ts   # a nota e as tentativas em TypeScript (Node 24)
php scripts/verify.php                       # os mesmos casos, o sorteio e a correção, sem banco

# com o MySQL 5.7 (o da hospedagem) ou o 8.4 (o do CI): o serviço, a API e o e2e no Chrome
docker run -d --rm --name poc-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
yarn verify
docker stop poc-mysql
```

O `verify.php` apaga e recria as tabelas `poc_quiz*` do banco informado: use um MySQL de teste.

## Resultado

- **TypeScript:** 17 testes, com os 12 casos de `cases/`.
- **PHP:** 48 verificações no MySQL 5.7.44 e no 8.4.13.
- **e2e:** no Chrome headless, o quiz inteiro feito só pelo teclado (inclusive a ordenação por Alt+↑, com o anúncio da posição), a aprovação com o XP, a reprovação com a espera e a janela num celular de 390 px, sem nenhum erro na página e sem pedido a outra origem.

## No produto (Etapa 2 da US58)

- O quiz vira uma ferramenta do registro de tipos da sala (US57): uma entrada `quiz` que fecha a missão, com a tela na tecla E.
- As tabelas vão para a próxima migration do banco de cada instituição.
- A primeira aprovação conclui a missão pela estratégia `GradedScoring` (o XP e os atributos dela, uma vez só).
- O editor de questões fica no editor do curso, com a auditoria.
- O visitante e o modo sem rede só fazem o modo treino, sem XP.
