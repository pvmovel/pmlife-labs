# PoC: criar um curso do zero pelo admin

## O que esta PoC mostra

O master de uma instituição recém-criada, ainda sem cursos, monta o primeiro curso no painel de administração de uma plataforma de ensino com várias instituições. A instituição da demonstração é uma escola de idiomas fictícia.

| O quê | Como |
| :--- | :--- |
| **Novo curso** | A tela Cursos pede o nome curto (o id do curso vira `<instituição>.<nome curto>`) e o título nos dois idiomas. O curso nasce de um **modelo mínimo válido**: a fase 1 com um prédio e uma missão de exemplo, e a escada com um nível de 0 XP. Ele abre no editor como rascunho, que os alunos ainda não veem. |
| **Curso e níveis** | O título, os atributos que o curso usa (do catálogo da instituição) e a escada de níveis. Cada nível tem o nome, o XP mínimo, o mínimo de cada atributo e as fases concluídas que ele exige. |
| **Fases** | A ordem, os pré-requisitos (a fase nova já exige a anterior) e os prédios da cidade de cada fase. A cidade e as salas são montadas no editor do mundo. |
| **Missões** | Por fase: o título, o prédio, o XP e os pontos de cada atributo do curso. |
| **Problemas, na hora** | A cada edição, a mesma validação do servidor, com os mesmos códigos: XP fora de ordem, missão num prédio que não existe, ciclo de pré-requisitos, texto vazio, entre outros. Cada problema leva ao campo, com o foco nele. |
| **Rascunho, publicação e visão do aluno** | Publicar valida e cria a versão. A "Visão do aluno" mostra as fases na ordem dos pré-requisitos. |
| **Só os masters criam** | "Papel (demonstração)": o autor de um curso não vê o "Novo curso". Se o pedido chegar mesmo assim, o "servidor" recusa. |

Os dados são inventados e ficam só na memória do navegador.

## Como funciona

```text
src/
├── Domain/                      TypeScript puro (sem React)
│   ├── Course.ts                o curso: título, atributos, escada de níveis, fases (pré-requisitos e prédios) e missões
│   ├── template.ts              o formulário do "Novo curso" e o curso a partir do modelo
│   ├── validateCourse.ts        a validação (os mesmos códigos do validador do produto) e a ordem das fases para o aluno
│   ├── editing.ts               as edições puras (níveis, fases, pré-requisitos, prédios, missões e atributos)
│   └── Drafts.ts                rascunho, publicação e quem cria cursos
├── Content/                     a instituição falsa, o modelo mínimo (courseTemplate.json) e os textos pt-BR e en-US
└── Presentation/
    ├── App.tsx                  a tela Cursos, o "Novo curso", o editor (abas, problemas, publicação) e a visão do aluno
    ├── useBuilder.ts            o estado da tela (as regras ficam no Domain)
    └── components/Panels.tsx    os painéis do curso, das fases e das missões
```

| Técnica | Por quê |
| :--- | :--- |
| **O modelo é dado, não código** | O modelo mínimo é um JSON versionado, conferido pelo validador nos testes. Trocar o ponto de partida dos cursos novos não mexe no código. |
| **Cada campo tem o caminho do validador** | O `data-path` (`/phases/1/quests/0/xp`) liga o problema ao campo: clicar no problema troca de aba e põe o foco nele, e o campo com problema fica marcado (`aria-invalid`). |
| **Edições puras** | Cada edição devolve um curso novo, e a que não muda nada devolve o mesmo objeto, então o editor não cria rascunho à toa. Tirar uma fase leva junto os pré-requisitos e as exigências de nível que apontavam para ela. Desligar um atributo tira os pontos dele. |
| **Abas acessíveis** | `role="tablist"`, com as setas trocando de aba, como no padrão ARIA. Os textos se editam nos dois idiomas, lado a lado, e no celular um embaixo do outro. |

## Como testar

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e no Chrome headless (teclado, celular, tema)
yarn dev      # demo em http://localhost:5173
```

## Resultado

- **18 testes:**
  - o modelo válido;
  - o formulário;
  - as edições;
  - os códigos do validador;
  - a ordem do aluno;
  - a publicação;
  - os quatro cenários do Gherkin na tela;
  - as abas pelo teclado;
  - o inglês.
- **O e2e no Chrome, com 18 checks:**
  - criar o primeiro curso só com o teclado;
  - a fase 2 com uma missão, publicada e vista pelo aluno depois da fase 1;
  - o XP zerado que não publica e leva ao campo;
  - o autor sem o "Novo curso";
  - o celular sem rolagem horizontal;
  - o tema claro;
  - nenhuma requisição a outra origem.

  Tudo verde em 3 rodadas seguidas.
