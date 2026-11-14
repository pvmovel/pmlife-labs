# Benchmark: orçamento de desempenho do campus 3D em aparelhos simples

A promessa é que o aluno de baixa renda estude no celular simples ou no notebook sem placa de vídeo. Este benchmark (US56) transforma isso em número verificável. Ele roda o campus 3D no aparelho e mede:

- o FPS e o tempo de quadro;
- os draw calls;
- os MB baixados e a memória.

Mede tanto com a resolução fixa de hoje quanto com a **qualidade adaptativa**. No fim, o resultado sai em JSON para `results/`.

## O orçamento

| Métrica | Limite | Onde é conferido |
| :--- | :--- | :--- |
| FPS mediano | **mínimo 30**, meta 60 | no aparelho, por este benchmark |
| Draw calls por quadro | **até 100 no celular**, 200 no computador | no aparelho |
| MB no primeiro acesso (comprimidos) | até 3 MB | no aparelho |
| Memória do JavaScript | até 150 MB (só onde o navegador informa) | no aparelho |
| Cada modelo 3D (`.glb`/`.gltf`) | até 1 MB com gzip | na **trava do CI**, no build |
| Cada textura, fonte e pedaço de JS | 512 KB, 64 KB e 400 KB com gzip | na trava do CI |
| Bundle inicial (o que o `index.html` carrega) | até 450 KB com gzip | na trava do CI |

Os números vivem em [`budget.json`](budget.json) e foram decididos em 2026-11-13. Os finais saem das medições nos aparelhos de referência, em [`results/`](results/).

## Como medir num aparelho

1. Abra a demo no aparelho, com o Chrome (no Android) ou o navegador do notebook. Feche os outros apps.
2. Escreva o modelo do aparelho (ex.: "Moto E13") e aperte **Medir**. São 4 rodadas de 20 s (~1,5 min), com a tela ligada e a aba à frente:
   - a cidade de um curso (3 prédios e 4 NPCs) e a de estresse (200 prédios);
   - cada uma com o DPR fixo `[1, 2]` de hoje e com a qualidade adaptativa.
3. Copie ou baixe o JSON e coloque em `results/<modelo>.json`.

A câmera faz a mesma volta em todo aparelho, para as rodadas serem comparáveis. Para variar a medição, a URL aceita:

| Parâmetro | Efeito |
| :--- | :--- |
| `?s=30` | segundos por rodada |
| `?rodadas=curso:adaptativo` | só as rodadas escolhidas |
| `?camera=orbital` | visão orbital |
| `?sombra=0` | sem sombras |
| `?sombraAvatar=contact` | a sombra do avatar com o `ContactShadows` |

## Qualidade adaptativa: como ficou

- O `PerformanceMonitor` do drei mede o FPS em janelas de 2 s e mexe num fator de 0 a 1:
  - abaixo de 40 FPS, cai 0,25 (margem sobre o mínimo de 30);
  - a partir de 55, sobe 0,25.
- O fator vira o DPR entre o **piso de 0,75** e o DPR do aparelho, até 2 (`Domain/AdaptiveQuality.ts`).
- A resolução cai **o quanto precisa** e nunca abaixo do piso. Do teto ao piso leva ~8 s.

## Achados (o que o produto precisa fazer diferente)

1. **O monitor só pode ligar com o frameloop `always`.**
   - Na visão orbital, a cena só desenha quando algo muda (`demand`), e o monitor lê os quadros esparsos como 4 FPS.
   - Com isso, baixa a resolução à toa. O e2e prova isso com `?monitor=forcado`.
2. **O DPR adaptativo tem que ser estado do React passado na prop `dpr` do Canvas.**
   - Chamar o `setDpr` do fiber direto não basta: a cada novo render, o Canvas reaplica a prop `dpr`.
   - Medido: o DPR voltava de 1,7 para 2 sozinho.
3. **Usar o `onDecline` e o `onIncline` do monitor, não o `onChange`.**
   - No drei 10.7, o `onChange` compara com um "último fator" que volta a 0 a cada render.
   - Por isso, a passagem para o fator 0 (o piso) não avisava, e a resolução parava em 1,05.
4. **O `AdaptiveDpr` do drei não combina com o monitor.**
   - Ele multiplica sempre o DPR *inicial* do Canvas (que fica fixo) e chama o `setDpr` direto (achado 2), então desfaz o que o monitor decidiu.
   - Na visão orbital, a cena já só desenha quando a câmera mexe. A recomendação é não usar o `AdaptiveDpr`.
5. **Contar draw calls exige desligar o `renderer.info.autoReset`.**
   - O contador zera a cada `gl.render`, e quem renderiza mais de uma vez no quadro (como o `ContactShadows`) apaga a contagem.
   - A sonda zera uma vez por quadro, depois de ler.
6. **A sombra do avatar em plano com textura confirma a decisão 4.**
   - Na cidade do curso são 23 draw calls por quadro, contra 36 com o `ContactShadows` (+57%), que renderiza a cena de novo a cada quadro.
7. **A cidade de um curso cabe com folga** (23 draw calls, de 100).
   - A de 200 prédios passa de 720: cada prédio custa a caixa, o passe da sombra e o rótulo de texto.
   - Cidades com mais de ~30 prédios vão precisar de instancing e de rótulos agrupados antes de ir para o celular.

## Os cenários da US56

- **Qualidade cai sozinha num aparelho lento:**
  - com o DPR fixo, o campus fica a ~13 FPS;
  - com a adaptativa, a resolução cai de 2 para 1,05 e o FPS volta a ~45;
  - numa GPU fraca demais, a resolução desce até o piso (0,75) e para nele.
- **Asset acima do orçamento barra o PR:**
  - `scripts/size-budget.mjs` mede cada arquivo do build com gzip e falha com o arquivo, o tamanho e o limite. Exemplo: `assets/predio-novo.glb: 1800.6 KB com gzip, acima do limite de 1024 KB (regra modelo-3d)`.
  - É o script que vai para o CI do produto.

## Sobre os números do e2e

No Chrome headless, a GPU é por software (SwiftShader, na CPU), e o FPS oscila com a carga da máquina.

- **O que vale:** os aparelhos de verdade, em `results/`.
- **O que o e2e prova:** o *mecanismo*. Para o cenário da qualidade adaptativa ser determinístico, ele simula uma GPU fraca: o tempo do quadro cresce com os pixels (`?custoMp=120`, em ms por megapixel). O relatório marca isso em `simulatedFillCostMs`.

## Arquitetura

- **Domain** (TypeScript puro, com testes):
  - `FrameStats` (mediana, 1% baixo, p95);
  - `Budget` (o orçamento e a conferência);
  - `AdaptiveQuality` (piso, teto, fator ➔ DPR, quando o monitor liga);
  - `SizeBudget` (a trava, sem import nenhum, para o script do Node ler direto);
  - `Scenario` (as cidades e a volta da câmera).
- **Presentation:**
  - a cena com a mesma receita do campus;
  - a sonda (`Probe`);
  - a qualidade adaptativa;
  - a página com i18n pt-BR/en-US.

## Rodar

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e no Chrome headless (~3 min)
yarn size     # build + trava de tamanho
yarn dev      # http://localhost:5173
```
