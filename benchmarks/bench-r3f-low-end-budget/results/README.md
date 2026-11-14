# Resultados por aparelho

Cada arquivo é o JSON que a página do benchmark gera no fim da medição (botões **Copiar JSON** e **Baixar**), com o nome do modelo do aparelho (`moto-e13.json`, `notebook-intel-uhd-620.json`).

Aparelhos de referência (decisão de 2026-11-13): um celular Android simples e um notebook com vídeo integrado.

| Aparelho | Arquivo | Data |
| :--- | :--- | :--- |
| _(a medir)_ | | |

No JSON:

- **`device`:** o modelo, a classe (`phone` ou `desktop`), a GPU que o navegador informa, os núcleos, a memória e a tela.
- **`firstLoad`:** os MB baixados (comprimidos) contra o limite.
- **`runs`:** cada rodada traz:
  - FPS mediano e 1% baixo, tempo de quadro p95;
  - draw calls, DPR do início ao fim e memória;
  - a conferência com o orçamento.

`simulatedFillCostMs` é sempre 0 numa medição de verdade.
