# Spike: Clean Architecture no front (troque a fonte de dados sem tocar na UI)

## Problema

Em muitos projetos React, o componente faz tudo:

```tsx
useEffect(() => {
  fetch('/api/config.php')
    .then((r) => r.json())
    .then((data) => setTitle(data.titulo_projeto_pt))
    .catch((err) => setTitle(`[Erro API] ${err.message}`));
}, []);
```

Isso traz três problemas:

- **a UI conhece o backend:** a URL, o formato do JSON e os códigos HTTP. Trocar de backend significa mexer em telas;
- **não dá para testar sem rede:** todo teste do componente precisa mockar o `fetch`;
- **vaza detalhe interno:** o `err.message` ou o corpo de erro do servidor aparece para o usuário.

## Solução: uma fatia vertical completa

```
Componente      ProjectTitle.tsx                só renderiza o estado
   │
Hook            useProjectTitle.ts              chama o caso de uso vindo do provider
   │
Composition     di/DependenciesProvider.tsx     ÚNICO lugar que escolhe o adapter concreto
Root
   │
Caso de uso     GetProjectTitleUseCase.ts       depende só do Port
   │
Port            ConfigGateway.ts                interface
   ▲
Adapters        HttpConfigGateway.ts            fetch + contrato da API
                InMemoryConfigGateway.ts        mesma interface, sem rede
```

| Princípio | Onde aparece |
| :--- | :--- |
| **Inversão de dependência (D do SOLID)** | O caso de uso depende de `ConfigGateway` (interface), não do `fetch`. Os adapters é que implementam o Port. |
| **Composition Root** | `DependenciesProvider` é o único arquivo da Presentation que importa a Infrastructure. O ESLint de fronteiras (técnica do [`spike-eslint-clean-arch-boundaries`](../spike-eslint-clean-arch-boundaries)) barra qualquer outro import. |
| **Responsabilidade única (S)** | O componente renderiza, o hook gerencia estado, o caso de uso aplica a regra e o adapter fala HTTP. |
| **Erros por código** | O `HttpConfigGateway` converte qualquer falha em `AppError` com código estável (`NETWORK_ERROR`, `HTTP_ERROR`, `API_ERROR`, `INVALID_RESPONSE`). A UI traduz o código. O texto do servidor nunca chega à tela. |
| **Contrato explícito** | Sucesso `{"status":"success","data":{...}}` e erro `{"status":"error","error":{"code":"..."}}`. O teste do adapter é o teste de contrato. |

### Testes

| Arquivo | O que prova |
| :--- | :--- |
| `GetProjectTitleUseCase.spec.ts` | a regra (idioma e título padrão) funciona com um gateway fake, sem rede |
| `HttpConfigGateway.spec.ts` | contrato: sucesso, 500 com envelope de erro (`API_ERROR` + `DB_UNAVAILABLE`), 500 com HTML (`HTTP_ERROR`, sem vazar `SQLSTATE`), JSON inválido ou fora do contrato, falha de rede |
| `ProjectTitle.spec.tsx` | o componente com o provider recebendo um fake exibe o título **sem nenhuma chamada a `fetch`**, e o erro aparece com a mensagem da UI |

## Demo

A página permite alternar entre **HTTP** (lê `api/config.json` no envelope do contrato), **HTTP com falha** (URL inexistente) e **Em memória**. A interface é a mesma nos três casos: só o Composition Root troca o adapter.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # ESLint de fronteiras + tsc + 9 testes
yarn dev      # demo em http://localhost:5173
```
