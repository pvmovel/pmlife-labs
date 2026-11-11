# Spike: avisos da instituição por lugar, num módulo próprio, sem WordPress

## Problema

Numa plataforma de ensino com cidades 3D, a instituição quer publicar avisos, artigos e tutoriais que o aluno lê dentro da cidade: na sede, na cidade de um curso ou numa fase. Ela quer fazer isso sem esperar uma versão nova da plataforma, em português e, quando quiser, também em inglês.

Restrições:
- **Custo zero:** a hospedagem compartilhada já paga (PHP 8.2 e MySQL), sem serviço novo.
- **Isolamento:** o aviso de uma instituição nunca aparece para outra.
- **Sem versão velha:** a correção de um aviso chega na abertura seguinte, sem Ctrl+F5.
- **Sem HTML perigoso:** o texto da instituição não pode levar script para a tela do aluno.

## As duas opções comparadas

| Critério | WordPress headless numa pasta | Módulo próprio no PHP |
| :--- | :--- | :--- |
| Isolamento | Uma categoria ou um site Multisite por instituição, no banco do WordPress, fora do filtro de instituição da plataforma | A mesma regra do resto da plataforma: a instituição vem da sessão, e no produto o aviso fica no banco dela |
| Quem publica | Um segundo login, com usuários e senhas próprios | O login e os papéis que já existem (o master e o autor do curso) |
| Idiomas | O filtro de idioma no REST é do Polylang Pro (pago); na versão grátis, é preciso um endpoint próprio | Duas colunas por aviso, com o recuo para o português na própria resposta |
| Sanitização | O HTML do editor visual, que também precisa ser higienizado | Markdown cru no banco; o HTML só nasce no navegador, higienizado |
| Cache | O REST do WordPress não manda ETag por padrão | ETag com `no-cache` e 304 |
| Manutenção e segurança | O núcleo e os plugins para atualizar, e mais uma superfície de ataque na mesma conta | Três classes e uma tabela, testadas como o resto |

**Decisão (do Pablo):** o módulo próprio. Este spike prova que ele cobre os critérios.

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Lugar | `hq` (a sede), `course:<curso>` (a cidade do curso) ou `phase:<curso>:<fase>` (uma fase) | Cada lugar tem o seu mural. No produto, o aluno lê no prédio "Mural" que a instituição põe no editor do mundo. |
| Formato | **Markdown**, cru no banco. O HTML só nasce no navegador, pelo marked e pelo DOMPurify, sem script, `on*`, `javascript:`, iframe, style nem formulário. O link para fora abre em outra aba, com `noopener noreferrer`. | O servidor nunca guarda HTML, e o mesmo código serve à prévia do editor e à leitura. |
| Idiomas | **pt-BR obrigatório** (título e corpo); **en-US opcional**, mas inteiro ou nada. Quem lê em inglês um aviso sem en recebe o pt marcado como recuo (`fallback: true`). | A instituição não fica presa a escrever em dois idiomas, e a tela avisa "em português". |
| Quem publica | O master da instituição em qualquer lugar; o autor de um curso só na cidade e nas fases dele; o aluno nunca (403) | Os papéis do admin que já existem. |
| Isolamento | A instituição vem só da sessão. Uma correção ou exclusão de outra instituição é 404, sem dizer que o aviso existe. | Mandar outra instituição no pedido não muda nada. |
| Cache | A lista vai com `ETag` (os ids e as horas de cada aviso, mais o idioma) e `Cache-Control: no-cache`; o mesmo ETag recebe 304, sem corpo | O navegador pergunta sempre, e a correção chega na abertura seguinte. |
| Tamanho | Título até 120 caracteres; corpo até 20 mil; até 50 avisos por lugar na lista, os fixados primeiro | Uma lista cheia tem ~59 KB e é lida em ~2 ms. |

## Solução

```text
src/Notices/NoticeRules.php    as regras puras: o lugar, o texto, quem publica, o idioma com recuo e o ETag
src/Notices/NoticeStore.php    a tabela, sempre com a instituição de quem pede no filtro
src/Notices/NoticeService.php  ler (ETag, 304, idioma) e publicar, corrigir ou apagar (só quem pode)
src/Notices/Author.php         quem pede, vindo só da sessão
src/Notices/DemoSession.php    a entrada da demo, no lugar do login do produto
src/bootstrap.php              a conexão (arquivo de ambiente fora do webroot) e a sessão
public/notices.php             GET o mural de um lugar · POST criar, corrigir ou apagar
public/session.php             POST entrar numa instituição fictícia com um papel
public/markdown.v1.js          Markdown ➔ HTML seguro (o mesmo no navegador e no teste; o nome tem a versão por causa da CDN)
public/index.html              a demo: o mural, a troca de idioma e o editor com a prévia
scripts/sanitize.test.mjs      os ataques comuns contra o Markdown higienizado, no jsdom
scripts/verify.php             as regras, o mural no MySQL e os endpoints de verdade
migrations/mysql/              a tabela spike_notices
```

### Os cenários da história

| Cenário | O que acontece |
| :--- | :--- |
| Aviso no idioma do aluno | O aluno da Aurora lê em inglês: o aviso com en vem em inglês, e o só em português vem marcado como recuo. O HTML sai higienizado. |
| Isolamento entre instituições | O aluno da Boreal abre o mural da sede e não vê o aviso da Aurora; o master da Boreal não o corrige nem apaga (404). |
| Aviso atualizado sem versão velha | Com o ETag da leitura anterior, o servidor responde 304; depois da correção, o mesmo ETag recebe 200 com o texto novo. |

## Como testar

```bash
yarn install
yarn verify   # a higienização e as regras, sem banco

# com o MySQL 5.7 (o da hospedagem) e o 8.4 (o do CI)
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike \
  SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
yarn verify   # PHP 8.2 com pdo_mysql e curl
docker stop spike-mysql
```

## Resultado

- **36 verificações verdes no MySQL 5.7.44 e no 8.4.13:**
  - 11 de higienização, em que oito ataques comuns saem e o Markdown fica;
  - 8 de regras, sem banco;
  - 12 do mural no banco;
  - 5 dos endpoints de verdade.
- **Resposta:** 1,3 KB com um aviso, 11,9 KB com 10 e 59 KB com 50 (o limite). A leitura de 50 avisos leva cerca de 2 ms no banco.
- **Higienização:** um aviso de ~20 mil caracteres vira HTML seguro em ~60 ms no jsdom. No navegador, é mais rápido.
- **Custo:** nenhuma dependência no servidor. O marked e o DOMPurify, que a plataforma já usa no guia do aluno, só descem quando o aluno abre o mural.

## Limites e próximos passos

- **No produto (US40):**
  - a tabela fica no banco de cada instituição, sem a coluna de instituição;
  - o aluno lê no prédio "Mural", que o master põe pelo editor do mundo, com a tecla E;
  - o editor fica no painel do admin;
  - a lista vem pela API da plataforma, com o mesmo ETag.
- **Ainda fora:** imagens enviadas pela instituição (o Markdown aceita link para uma imagem já hospedada), agendamento e aviso de "não lido".
- **Limpeza da demo:** os avisos fictícios somem em 1 dia.
