# Spike: arquivos da instituição fora do webroot, servidos pelo PHP

## Problema

O autor de um curso precisa subir o próprio material (o PDF da aula, o áudio, as imagens das placas) sem contratar outro servidor. As restrições são as de sempre do projeto:

- hospedagem compartilhada com **PHP 8.2 e MySQL 5.7**, sem Composer e **sem custo**, com o Cloudflare na frente;
- o deploy é por FTPS: uma pasta de uploads dentro do site seria **sobrescrita** a cada deploy, e uma pasta pública com permissão de escrita é a porta de entrada clássica para alguém subir um script e executá-lo;
- um link para outro site depende de CORS e do site de origem continuar no ar;
- cada instituição só vê o próprio material, e só quem está matriculado no curso abre o arquivo.

O spike responde 3 perguntas:
1. Dá para guardar o arquivo **fora do webroot** e entregá-lo pelo PHP só a quem tem sessão e matrícula?
2. Dá para conferir o tipo pelo **conteúdo** e manter a **cota** certa mesmo com envios ao mesmo tempo?
3. O **`Range`** (o áudio avançando sem baixar tudo) funciona no PHP compartilhado e passa pelo Cloudflare?

## Decisões

| Tema | Decisão | Por quê |
| :--- | :--- | :--- |
| Onde fica | Uma pasta no HOME da hospedagem, **fora do `public_html`** e do deploy: `<raiz>/t<instituição>/<chave>` | O navegador não alcança o arquivo, o Apache não o executa e o deploy não o apaga. A raiz vem do env, e uma raiz dentro do webroot é recusada (`STORAGE_ROOT_INSIDE_WEBROOT`). |
| Nome no disco | **32 hex gerados pelo servidor**, sem extensão; o id público é outro, também gerado | Nada do pedido vira caminho (sem path traversal), e sem extensão nada é interpretado como PHP. |
| Tipo | Conferido pela **assinatura** dos primeiros bytes, numa **lista de permitidos**: PDF, MP3, M4A, OGG (Vorbis ou Opus), JPEG, PNG, WebP e GIF | A extensão e o `Content-Type` do navegador são escolhidos por quem envia. O SVG fica de fora (pode levar script). O M4A precisa da marca de áudio, e o Ogg do codec de áudio: um vídeo não entra disfarçado. |
| Segunda barreira | Na entrega: o tipo conferido, `nosniff`, CSP `sandbox` na imagem e no áudio, `private, no-store` | Um GIF com HTML escondido ainda é um GIF válido. Ele não roda script nem é guardado no cache do Cloudflare. |
| Limites | **20 MB por arquivo** e **1 GB por instituição**, ajustáveis pelo master da plataforma | Decisão do Pablo (2026-11-13). O disco para de ler no limite + 1 byte, mesmo que o tamanho declarado minta. |
| Cota | Reserva num **`UPDATE` com a condição no `WHERE`** (`used + n <= quota`), antes de gravar | O banco trava a linha, e o segundo envio enxerga o uso já somado: nunca passa do teto, sem `SELECT … FOR UPDATE`, igual no MySQL 5.7 e no PostgreSQL. |
| Falhas | Gravou e o registro falhou: o arquivo é apagado e a reserva volta. Registro sem arquivo: 404 e log | Nada fica órfão ocupando cota. |
| Quem vê | Outra instituição, curso sem matrícula ou id inexistente: **sempre 404** | Ninguém descobre que o arquivo existe (BOLA/IDOR). Só quem gerencia o curso envia e apaga (403 para o aluno). |
| `Range` | Um trecho por pedido (`a-b`, `a-` e `-n`), 206 ou 416; vários trechos recebem o arquivo inteiro | É o que o `<audio>` e os leitores de PDF pedem. O envio é em blocos de 8 KB, sem carregar o arquivo na memória, e sem gzip (que quebraria os trechos). |
| Sessão | `session_write_close()` antes de entregar | O `<audio>` pede vários trechos ao mesmo tempo: a sessão do PHP travaria os outros pedidos. |
| Porta | `FileStorage` (o disco hoje; S3 ou R2 na escala) | O caminho de escala do projeto (ADR-006): trocar o armazenamento não muda o serviço nem a API. |

## Solução

```text
migrations/
├── mysql/000..002   schema_migrations · file_quota (teto e uso) · stored_files (o registro)
└── pgsql/000..002   o mesmo em PostgreSQL
src/
├── Storage/
│   ├── FileSniffer.php        o tipo pela assinatura (lista de permitidos)
│   ├── FileStorage.php        a porta do armazenamento
│   ├── LocalDiskStorage.php   <raiz>/t<instituição>/<chave>, temporário + rename, 640/750, recusa raiz no webroot
│   ├── QuotaStore.php         a cota (PdoQuotaStore com a reserva atômica; MemoryQuotaStore nos testes)
│   ├── FileRepository.php     o registro (PdoFileRepository; MemoryFileRepository nos testes)
│   ├── FileService.php        enviar, listar, abrir e apagar, nesta ordem de conferências
│   ├── FileName.php           ids gerados e o nome original limpo (só para o download)
│   ├── FileLimits.php         20 MB por arquivo e 1 GB por instituição
│   ├── Viewer.php             quem pede (instituição, conta, se gerencia, matrículas)
│   └── StoredFile.php / FileRejected.php
├── Http/
│   ├── ByteRange.php          o cabeçalho Range (RFC 9110)
│   ├── FileSender.php         os cabeçalhos e o envio em blocos
│   └── FilesApi.php           upload, list, delete e show, com o envelope do contrato
└── Db/                        ConnectionFactory e Migrator (os do spike de migrations)
http/api/files.php             o controller fino (bloqueado no labs: aqui não há upload público)
public/                        a demo: index.html, demo.v1.js e stream.php
samples/                       um PDF e um PNG fictícios, gerados por scripts/make-samples.php (bloqueado: 403)
scripts/verify.php             a prova (abaixo); scripts/quota-worker.php, um envio concorrente
```

**Envio:**
1. A conta gerencia o curso? Se não, 403.
2. O arquivo está vazio ou passa do limite? 422 ou 413.
3. O tipo é permitido pelo conteúdo? Se não, 415.
4. Cabe na cota? Se não, `413 QUOTA_EXCEEDED`, com o uso e o teto para o aviso.
5. Grava no disco e registra; se algo falhar, desfaz os dois.

**Leitura:** busca o registro pela instituição e pelo id, confere a matrícula e entrega pelo `FileSender`, inteiro ou em trechos.

## Demo

`public/` é só leitura: **o labs não aceita upload**, porque o repositório é público e um upload aberto no servidor seria um risco.

O `stream.php` entrega, com `Range`, um PDF e um PNG fictícios guardados em `samples/`, uma pasta que o navegador não acessa (403). A página mostra:
- a imagem entregue pelo PHP;
- o PDF abrindo em outra aba;
- 3 pedidos com `Range` (o começo, o fim e além do fim), com o status e o `Content-Range` de cada um.

O smoke do deploy do labs confere o `206` e o `416` pela URL pública. Isso prova que o PHP da hospedagem e o Cloudflare deixam os trechos passar.

## Resultado

- **58 checks sem banco**, no PHP 8.2/8.3:
  - os 8 tipos e os 11 disfarces recusados;
  - os ids e os nomes, e o `Range` nas regras;
  - o disco (raiz no webroot, permissões, traversal, limite real);
  - o serviço e a API em memória, com os 3 cenários do Gherkin;
  - o `Range` de verdade num `php -S`.
- **Com banco** (MySQL 8.4 e PostgreSQL 16 no CI), o mesmo serviço com os stores PDO e **12 processos reservando ao mesmo tempo**: exatamente os que cabem passam.
- **Gherkin:**
  - um `.pdf` que é um executável é recusado pelo conteúdo;
  - o aluno da instituição B recebe 404 no PDF da A;
  - com a cota cheia, o autor vê o aviso com o uso e o teto.
- **O que o spike mostrou:**
  - **O PDF não leva CSP `sandbox`:** o leitor de PDF do navegador se recusa a abrir dentro do sandbox. Isso precisa ser conferido na demo, abrindo o PDF no Chrome e no Firefox. A proteção dele fica no tipo conferido, no `nosniff` e na pasta fora do webroot.
  - **Um GIF com código escondido passa pela assinatura**, porque continua sendo um GIF válido. Quem o segura são as outras barreiras: fora do webroot, sem extensão, `nosniff` e `sandbox`.
  - **O `Content-Disposition` leva o nome em ASCII e em UTF-8 (RFC 6266):** o nome com acento chega certo ao baixar.

## Para a Etapa 2 (no `pmlife`)

- **Conferido no cPanel pelo Pablo (2026-11-27):** o disco do plano comporta dezenas de instituições com 1 GB cada, e o `upload_max_filesize` e o `post_max_size` (cPanel ➔ "MultiPHP INI Editor") passam dos 20 MB por arquivo. Assim, o limite de 20 MB vale pelo PHP do produto (o `FileLimits`), e não pelo PHP da hospedagem.
- **Pasta:** criar a pasta no HOME, fora do `public_html`, com a permissão 750, e o caminho dela no `.env.php` do ambiente.
- **Tabelas:** `file_quota` e `stored_files` vão para o banco da instituição (um banco por instituição, US44), por migration da instituição aplicada pelo Cron. O `tenant_id` do spike existe só para provar o isolamento num banco único.
- **Teste com banco:** o teste do serviço no MySQL 5.7 entra no CI do `pmlife`. Este spike roda no 8.4 do CI do labs, com o SQL sem nada exclusivo do MySQL 8.
- **Decisão nova:** um ADR que ajusta o ADR-012, que proibia gravar arquivos no servidor.

## Como rodar

```bash
cd spikes/spike-php-file-storage-outside-webroot
php scripts/verify.php                 # sem banco: os tipos, o disco, as regras e o Range num php -S

# com banco (descartável; o script apaga as tabelas do spike):
docker run -d --rm --name spike-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=spike \
  -e MYSQL_USER=spike -e MYSQL_PASSWORD=spikepw -p 127.0.0.1:13306:3306 mysql:5.7
docker run -d --rm --name spike-pg -e POSTGRES_DB=spike -e POSTGRES_USER=spike \
  -e POSTGRES_PASSWORD=spikepw -p 127.0.0.1:15432:5432 postgres:16
export SPIKE_MYSQL_HOST=127.0.0.1 SPIKE_MYSQL_PORT=13306 SPIKE_MYSQL_DB=spike SPIKE_MYSQL_USER=spike SPIKE_MYSQL_PASS=spikepw
export SPIKE_PGSQL_HOST=127.0.0.1 SPIKE_PGSQL_PORT=15432 SPIKE_PGSQL_DB=spike SPIKE_PGSQL_USER=spike SPIKE_PGSQL_PASS=spikepw
php scripts/verify.php
docker stop spike-mysql spike-pg

php -S 127.0.0.1:8080 -t public        # a demo em http://127.0.0.1:8080/
php scripts/make-samples.php           # gera de novo as amostras (os mesmos bytes)
```
