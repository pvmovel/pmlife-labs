# PoC: motor de gamificação para qualquer trilha de aprendizado

## O que esta PoC prova

Que **uma única regra de progressão** (níveis por XP, missões e progresso salvo) atende **qualquer área de conhecimento**. Para lançar uma trilha nova (culinária, idiomas, tecnologia, preparação para concursos), basta escrever um arquivo de conteúdo, sem nenhuma linha de código nova.

Na demo, duas trilhas fictícias rodam no mesmo motor:

| Trilha | Níveis |
| :--- | :--- |
| Culinária | Ajudante de Cozinha (0) ➔ Cozinheiro (1000) ➔ Sous-chef (2500) ➔ Chef de Cozinha (5000) |
| Idiomas | A1 (0) ➔ A2 (400) ➔ B1 (1200) ➔ B2 (2500) ➔ C1 (4500) |

## Por que importa para o negócio

| Situação comum | Com este motor |
| :--- | :--- |
| Níveis e limites de XP escritos no código: **cada trilha nova é um projeto de desenvolvimento** | A trilha é um JSON (`src/Content/*.json`): lançar uma trilha é tarefa de conteúdo |
| O `if/else` de limiares sobe **um nível por vez**: quem ganha 3000 XP de uma vez fica no nível seguinte, não no que mereceu | O nível é **derivado do XP**: o aprendiz vai direto para onde a pontuação manda |
| Repetir uma missão pode somar pontos de novo | Missões são **idempotentes**: concluir de novo não soma XP |
| Progresso preso à tela | O progresso vira um **snapshot** simples, que pode ser salvo (no navegador ou no servidor) e restaurado |

## Como funciona (para quem vai implementar)

```
src/Content/culinaria.json, idiomas.json   conteúdo: níveis, XP mínimo e missões de cada trilha
        │
src/Domain/CareerLadder.ts                 a escada de UMA trilha; valida (começa em 0, XP crescente, ids únicos)
src/Domain/LearnerProgress.ts              o progresso: nível = ladder.levelFor(xp); missões idempotentes;
                                           toSnapshot() / LearnerProgress.restore(snapshot, ladder)
        │
src/Presentation/                          a demo (React): só usa o domínio
```

- O **domínio é TypeScript puro**: não conhece React, conteúdo nem tela. O ESLint de fronteiras garante isso.
- `addExperience` devolve a **promoção** (`de`, `para`, `níveis ganhos`), que a interface usa para comemorar.
- O snapshot carrega o id da trilha, e **não é possível restaurar um progresso na trilha errada**.

### Testes (13)

| Arquivo | O que prova |
| :--- | :--- |
| `CareerLadder.spec.ts` | nível pelo XP nos limites exatos, próximo nível, escadas inválidas rejeitadas |
| `LearnerProgress.spec.ts` | salto de vários níveis, XP inválido, idempotência, reidratação com quests já feitas, round-trip do snapshot, trilha errada, outra escada sem mudar código |
| `App.spec.tsx` | a demo usa o domínio de verdade: salto de níveis × if/else, missão repetida, troca de trilha |

## Demo

- Escolha a trilha e use **+100 / +500 / +3000 XP** ou conclua missões.
- **"Por que a regra importa"** compara este motor com o `if/else` que sobe um nível por vez.
- **Salvar / Restaurar** mostra o snapshot e a reidratação.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 13 testes
yarn dev      # demo em http://localhost:5173
```
