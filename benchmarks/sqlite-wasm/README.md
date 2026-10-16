# Benchmark: SQLite WASM no navegador (VFS opfs-sahpool)

Tempos do banco local usado pelo [`spike-sqlite-wasm-browser-persistence`](../../spikes/spike-sqlite-wasm-browser-persistence): SQLite 3.53.4 num Web Worker, gravando no OPFS pelo VFS `opfs-sahpool`.

## Método

- **Onde:** Chrome 139 headless, notebook de desenvolvimento com 8 núcleos e SSD. Build de produção do Vite servido localmente, perfil novo a cada execução.
- **Como:** o `scripts/e2e.mjs` do spike abre a página, mede a abertura do banco e clica em **Medir**, que roda no Worker:
  - inserir 1.000 linhas numa única transação (statement preparado);
  - ler as 1.000 linhas;
  - 50 gravações avulsas, cada uma na sua transação (o custo de um "concluir missão").
- **Amostra:** 4 execuções; a tabela mostra a mediana e a faixa.
- **Na CI:** a cada deploy do labs, o `verify` do spike roda de novo num runner do GitHub. Os números daquela máquina aparecem na página do spike, na saída da execução.

## Resultados

| Etapa | Mediana | Faixa (4 execuções) |
| :--- | ---: | ---: |
| Carregar e compilar o WASM | 52 ms | 51 – 53 ms |
| Instalar o VFS `opfs-sahpool` | 38 ms | 35 – 78 ms |
| Abrir o banco + migrations (2, na primeira visita) | 49 ms | 48 – 76 ms |
| **Abertura total** | **~140 ms** | 135 – 207 ms |
| Inserir 1.000 linhas (1 transação) | 27 ms | 24 – 32 ms |
| Ler 1.000 linhas | 15 ms | 12 – 17 ms |
| Gravação avulsa (média de 50) | 3,5 ms | 3,45 – 3,65 ms |

## Leitura

- A abertura acontece **uma vez por carregamento**, dentro do Worker: a página continua respondendo enquanto isso. Para o produto, cabe sem problema no tempo de carregar a cena 3D.
- Uma gravação de progresso custa ~3,5 ms. Mesmo gravando a cada missão concluída, não há o que otimizar (lote ou debounce) por enquanto.
- Gravar em lote é ~130 vezes mais barato por linha que gravar avulso (0,027 ms × 3,5 ms). Importação de muitos registros deve sempre usar uma transação.
- A primeira execução de cada lote foi a mais lenta (VFS em 78 ms): é o custo de criar o pool de arquivos no OPFS pela primeira vez naquele perfil.

## Reproduzir

```bash
cd spikes/spike-sqlite-wasm-browser-persistence
yarn install --frozen-lockfile
yarn e2e        # imprime os tempos no fim
```

Ou abra a demo do spike e clique em **Medir** para ver os números do seu navegador.
