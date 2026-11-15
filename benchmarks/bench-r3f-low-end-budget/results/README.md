# Resultados por aparelho

Cada arquivo é o JSON que a página do benchmark gera no fim da medição (botões **Copiar JSON** e **Baixar**), com o nome do modelo do aparelho (`moto-e13.json`, `notebook-intel-uhd-620.json`).

Aparelhos de referência (decisão de 2026-11-13): um celular Android simples e um notebook com vídeo integrado.

| Aparelho | Arquivo | Data |
| :--- | :--- | :--- |
| Samsung Galaxy A26 (Mali-G68, tela 2,625× limitada a 2) | [`samsung-galaxy-a26.json`](samsung-galaxy-a26.json) | 2026-11-14 |
| Notebook Intel Core i3 (UHD Graphics ICL GT1, 1366×768) | [`notebook-intel-i3-uhd-icl.json`](notebook-intel-i3-uhd-icl.json) | 2026-11-14 |

## O que as medições mostraram

| Rodada | Galaxy A26 | Notebook i3 |
| :--- | :--- | :--- |
| Cidade do curso, DPR fixo | 60 FPS (1% baixo 57), 21 draw calls | 60 FPS (1% baixo 54), 23 draw calls |
| Cidade do curso, adaptativa | 60 FPS, DPR ficou em 2 | 60 FPS, DPR ficou em 1 |
| 200 prédios, DPR fixo | 60 FPS (1% baixo 49), 582 draw calls | 57,5 FPS (1% baixo 29), 722 draw calls |
| 200 prédios, adaptativa | 60 FPS (1% baixo 47) | 57,8 FPS (1% baixo 34) |

- **A cidade de um curso cumpre a meta de 60 FPS nos dois aparelhos**, com folga nos draw calls (21 e 23, de 100 e 200), no primeiro acesso (0,45 MB, de 3) e na memória (até 33 MB, de 150).
- **A qualidade adaptativa não mexeu na resolução** em nenhuma rodada: o FPS nunca ficou abaixo de 40 numa janela de 2 s. Isso confirma que ela não baixa a qualidade à toa num aparelho que aguenta. O mecanismo de queda está provado no e2e, com a GPU fraca simulada.
- **O primeiro sinal de limite é o notebook com 200 prédios:** o 1% baixo cai para 29 FPS com ~720 draw calls. O gargalo é o número de draw calls, não a resolução (o DPR já é 1).
- A rodada de 200 prédios falha na conferência de draw calls nos dois aparelhos, como esperado: ela existe para mostrar onde o orçamento quebra.
- **O orçamento fica como estava** (decisão de 2026-11-14). O Galaxy A26 é um intermediário e aguentaria mais draw calls, mas o limite de 100 no celular protege os aparelhos de entrada, mais fracos que o medido.
- No Chrome do Android, a memória do JavaScript vem arredondada em faixas (por isso o 9,54 MB igual em todas as rodadas).

No JSON:

- **`device`:** o modelo, a classe (`phone` ou `desktop`), a GPU que o navegador informa, os núcleos, a memória e a tela.
- **`firstLoad`:** os MB baixados (comprimidos) contra o limite.
- **`runs`:** cada rodada traz:
  - FPS mediano e 1% baixo, tempo de quadro p95;
  - draw calls, DPR do início ao fim e memória;
  - a conferência com o orçamento.

`simulatedFillCostMs` é sempre 0 numa medição de verdade.
