# PoC: painel de administração multi-instituição

## O que esta PoC mostra

Um painel de administração para uma plataforma de ensino com várias instituições. O mesmo painel muda conforme quem entra:

| Papel | Vê e faz |
| :--- | :--- |
| **Master da plataforma** | Tudo: cria, desativa e reativa instituições (com o e-mail do master de cada uma) e entra nas pessoas, matrículas, cursos e auditoria de qualquer instituição |
| **Master da instituição** | Só a própria: desativa pessoas, aprova ou recusa pedidos de matrícula, publica cursos e vê a auditoria dela |
| **Autor do curso** | Só os cursos, e só publica aqueles em que foi designado |
| **Tutor** | Acompanha as pessoas e os cursos, sem alterar nada |
| **Aluno** | Nada: "Acesso recusado" |

Na demo, o seletor **"Ver como"** troca de papel. Os dados são inventados e ficam só na memória do navegador.

## Como funciona

```text
src/
├── Domain/                      TypeScript puro (sem React)
│   ├── AdminAccess.ts           can(ator, ação, escopo) e visibleSections(ator): a regra papel × instituição × curso
│   ├── Listing.ts               listRows: busca sem acento, ordenação natural e paginação
│   ├── InstitutionForm.ts       validação do formulário (códigos de erro estáveis) e o slug sugerido pelo nome
│   └── AdminRecords.ts          o que o admin lista
├── Content/                     dados falsos e textos pt-BR / en-US (a mesma chave nos dois, o TypeScript confere)
└── Presentation/
    ├── App.tsx                  casca: navegação lateral (gaveta no celular), "Ver como", instituição em foco, idioma, tema
    ├── useAdminStore.ts         as ações conferem a permissão (como o servidor) e gravam a auditoria
    ├── components/DataTable.tsx tabela com busca, aria-sort e paginação; no celular, cada linha vira um cartão
    ├── components/Dialog.tsx    janela modal e confirmação de ação destrutiva (foco preso, Esc, foco devolvido)
    └── pages/                   instituições, pessoas, matrículas, cursos e auditoria
```

| Técnica | Por quê |
| :--- | :--- |
| **Uma regra só para as permissões** | `can(ator, ação, { instituição, curso })` decide a navegação, os botões e o estado. A tela só esconde o que não cabe ao papel; a ação fora do papel é recusada também no estado (`FORBIDDEN`), como o servidor fará em cada endpoint. |
| **O escopo vem da sessão, não da tela** | O master da instituição não escolhe a instituição: ela vem do papel. Só o master da plataforma tem o seletor "Instituição". |
| **Confirmação nas ações destrutivas** | Desativar e recusar abrem um `alertdialog` com o foco em **Cancelar**, o botão de confirmar tem o nome da ação, e Esc fecha devolvendo o foco a quem abriu. Aprovar não pede confirmação: dá para desfazer. |
| **Auditoria** | Toda ação grava quem, o quê, em quê e quando. O master da instituição vê só a auditoria da dele. |
| **Formulário validado** | Os erros são códigos do Domain, traduzidos na tela, ligados ao campo por `aria-describedby`, com `aria-invalid` e o foco no primeiro campo errado. |
| **Tabela acessível** | `caption`, `scope="col"`, `aria-sort` no cabeçalho, o total anunciado e a página em `aria-live`. No celular, o cabeçalho sai e cada célula mostra o rótulo da coluna. |
| **Sem biblioteca de componentes** | Tokens de cor em CSS para os temas escuro e claro (texto com contraste de pelo menos 4,5:1), um único bundle pequeno e o mesmo React do resto do projeto. |
| **i18n** | Nenhum texto fixo na tela; trocar o idioma muda também o `lang` e o título da página. |

### Testes

**No Node** (`yarn test`):
- o Domain: a tabela de permissões, a listagem e a validação;
- a tela, com os cenários do Gherkin: o master da plataforma cria uma instituição e ela aparece na lista e na auditoria; o master da instituição não vê outra; o aluno é recusado; a ação fora do papel é recusada no estado; o formulário, a busca, a ordenação, a paginação, as confirmações, o autor, o tutor e o inglês.

**No Chrome headless** (`yarn e2e`), com o build de verdade:
- só com o teclado: "Pular para o conteúdo", criar uma instituição e a confirmação com Esc;
- num celular de 390 px: a gaveta (botão e Esc), a tabela em cartões e nenhuma rolagem horizontal;
- o tema claro, o aluno recusado, nenhum erro e nenhuma requisição a outra origem.

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + testes + e2e
yarn dev      # demo em http://localhost:5173
```

## Limites

- É só a tela: os dados são falsos e ficam na memória. A recusa no servidor, o isolamento no banco e a auditoria persistente são provados à parte.
- O "Ver como" existe só na demo; no produto, o papel vem da sessão.
