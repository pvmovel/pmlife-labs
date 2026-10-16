# Spike: i18n tipado em React (nenhum texto fixo, nenhuma chave errada)

## Problema

Com o tempo, a internacionalização de um front costuma degradar:

- **texto fixo** escapa para dentro dos componentes (`<button>Fechar</button>`);
- **chave digitada errado** (`t('footer.relase.title')`) só aparece como texto quebrado em produção;
- **idiomas descompassados**: alguém adiciona uma chave no pt-BR e esquece o en-US;
- `<html lang>` fica fixo e não acompanha o idioma (ruim para leitores de tela e SEO).

## Solução (sem biblioteca)

```
src/Content/Locales/
├── pt-BR/   common.json · footer.json · demo.json      <- referência
└── en-US/   common.json · footer.json · demo.json
src/Presentation/i18n/
├── messages.ts       monta os dicionários por namespace; en-US anotado com o tipo do pt-BR
├── keys.ts           TranslationKey: todos os caminhos até uma folha ('footer.release.title')
└── I18nProvider.tsx  Context + t(key, params) + localStorage + <html lang>
```

| Técnica | Como funciona |
| :--- | :--- |
| **Namespaces por arquivo** | Cada área da UI tem o seu JSON (`common`, `footer`...). O dicionário de um idioma é `{ common, footer, demo }`. |
| **Chaves tipadas por caminho** | `TranslationKey` é derivado do JSON pt-BR com *template literal types*. `t('footer.relase.title')` não compila, e o editor autocompleta as chaves válidas. |
| **Paridade em compilação** | `const enUS: Messages = {...}`: se faltar uma chave no en-US em relação ao pt-BR, **o build não compila**. |
| **Paridade em execução** | Um teste compara todos os caminhos dos dois idiomas, o que pega também **chaves a mais**, que o TypeScript aceita em JSON importado. Ele também confere textos vazios e os mesmos parâmetros de interpolação. |
| **Interpolação** | `t('common.greeting', { name: 'Ana', count: 3 })` ➔ "Olá, Ana! Você tem 3 missões hoje." |
| **`<html lang>`** | O provider atualiza `document.documentElement.lang` a cada troca, e o idioma escolhido fica no `localStorage`. |

### Testes (8)

| Arquivo | O que prova |
| :--- | :--- |
| `LocalesParity.spec.ts` | mesmas chaves em todos os idiomas, nenhum texto vazio, mesmos parâmetros de interpolação |
| `translate.spec.ts` | resolução por caminho, interpolação e **`@ts-expect-error`** em chave inexistente (se ela compilasse, o `tsc` do `verify` falharia) |
| `App.spec.tsx` | trocar o idioma muda todos os textos e o `<html lang>`, e a escolha é lembrada |

## Demo

A página inteira, inclusive os botões de navegação, vem dos JSON. Troque PT/EN e veja o valor real de `<html lang>` mudar.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc (inclui o @ts-expect-error) + 8 testes
yarn dev      # demo em http://localhost:5173
```
