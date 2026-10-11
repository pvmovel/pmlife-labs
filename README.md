# PMLife Labs 🧪 (Engine 3D & Frontend Showcase)

[![CI](https://github.com/pvmovel/pmlife-labs/actions/workflows/ci.yml/badge.svg)](https://github.com/pvmovel/pmlife-labs/actions/workflows/ci.yml) [![Deploy Labs](https://github.com/pvmovel/pmlife-labs/actions/workflows/deploy-labs.yml/badge.svg)](https://github.com/pvmovel/pmlife-labs/actions/workflows/deploy-labs.yml)

Repositório público de Pesquisa e Desenvolvimento (P&D), Spikes de Arquitetura, benchmarks de SQLite WASM e PoCs de renderização 3D para a plataforma PMLife.

Cada spike isola **uma técnica** (não o produto), com um `README.md` explicando o problema, a solução e como testar.

## 🧪 Spikes

| Spike | Tema |
| :--- | :--- |
| [`spikes/spike-php-env-security-hostgator`](spikes/spike-php-env-security-hostgator) | Credenciais fora do webroot em hospedagem compartilhada, erros PDO sanitizados e headers de segurança via `.htaccess` |

## 📊 Benchmarks

- `benchmarks/sqlite-wasm`: testes de desempenho do banco local no navegador.

## 🚀 CI/CD e demos ao vivo

Todo push na `main` passa pelos gates do [`ci.yml`](.github/workflows/ci.yml) (gitleaks, checagem de termos proibidos, `php -l`, build) e é publicado automaticamente pelo [`deploy-labs.yml`](.github/workflows/deploy-labs.yml) via FTPS, com smoke test ao final. PRs e outras branches rodam só os gates.

Convenção para cada `spikes/<nome>/` (ou `benchmarks/<nome>/`), que precisa ter um `README.md` para entrar no catálogo:

| Pasta / arquivo | O que acontece no deploy |
| :--- | :--- |
| `public/` | webroot da demo (PHP ou HTML), acessível publicamente |
| `package.json` com script `build` | o CI roda `yarn build --base=<base>/<grupo>/<nome>/dist/` e publica `dist/` |
| qualquer outra pasta (`src/`, `config/`…) | vai para o servidor, porque os `require` relativos precisam dela, mas responde **403** |

O catálogo (`index.html`) é gerado por [`scripts/build-site.sh`](scripts/build-site.sh) a partir do primeiro `# título` de cada README. Para testar localmente: `bash scripts/build-site.sh` e abrir `_site/index.html`.

