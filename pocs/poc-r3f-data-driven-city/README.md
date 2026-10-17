# PoC: cidade 3D orientada a dados

## O que esta PoC mostra

Um único motor 3D desenha **uma cidade diferente para cada trilha de aprendizado**. Os prédios (posição, tamanho, cor e nome) vêm de um arquivo JSON por trilha:

- **trocar de trilha troca a cidade inteira**, sem nenhum componente novo;
- **um prédio novo é uma linha a mais no arquivo**;
- **uma trilha nova é uma pasta nova** (`src/Content/Curriculum/<trilha>/buildings.json`), descoberta sozinha.

Para o negócio, isso quer dizer que montar o campus de outra profissão, de um concurso ou do ENEM é trabalho de conteúdo, não de programação.

## Como funciona

```
src/
├── Content/Curriculum/<trilha>/buildings.json   a cidade (dado)
├── Domain/City.ts                               validateCity: ids únicos, dimensões, cores, prédios sem sobreposição
├── Application/Ports/CurriculumRepository.ts    de onde vem a cidade (hoje JSON; amanhã banco ou API por cliente)
├── Infrastructure/JsonCurriculumAdapter.ts      descobre as pastas (import.meta.glob) e valida antes de entregar
└── Presentation/
    ├── di/                                      Composition Root (único ponto que conhece o adapter)
    ├── App.tsx                                  página: trilha, idioma, Suspense com loader traduzido
    └── Engine3D/
        ├── CityCanvas3D.tsx                     Canvas (carregado com React.lazy)
        ├── CityScene.tsx                        luzes, chão e prédios via .map() (testável sem WebGL)
        └── Building3D.tsx                       um prédio: caixa + rótulo
```

| Técnica | Por quê |
| :--- | :--- |
| **Validação no domínio** | Erro de digitação no JSON (cor `azul`, altura `0`, id repetido) ou prédio em cima de outro vira uma mensagem clara, e a cidade não é desenhada pela metade. |
| **`React.lazy` + `Suspense`** | O three.js fica num chunk separado: a página abre com **72 KB** (gzip) e os **289 KB** da cena 3D chegam depois, com um indicador de carregamento traduzido. |
| **Fonte local com hash** | Rótulos com a Inter (`@fontsource`, licença OFL) importada pelo código (`?url`). Ela sai do build com hash no nome e cache imutável. |
| **Sombras de verdade** | `shadows` no `Canvas`, `castShadow` na luz, `castShadow`/`receiveShadow` nos objetos e a câmera de sombra cobrindo a cidade. |
| **`frameloop="demand"`** | Uma cidade parada não precisa de 60 quadros por segundo: a cena só redesenha quando a câmera ou o dado mudam. |
| **Rótulos legíveis** | `Billboard` (sempre de frente para a câmera) e sem teste de profundidade (nunca somem atrás de outro prédio). |
| **Acessibilidade** | O canvas tem `role="img"` e um `aria-label` traduzido ("Cidade 3D da trilha Culinária, com 4 prédios"). |

### Testes (13)

| Arquivo | O que prova |
| :--- | :--- |
| `City.spec.ts` | validação: cidade coerente, sobreposição, prédios encostados, erros de digitação, cidade vazia |
| `JsonCurriculumAdapter.spec.ts` | trilhas descobertas pelas pastas; todo rótulo existe nos dois idiomas; **arquivo novo = cidade nova**; cidade inválida não chega à cena |
| `CityScene.spec.tsx` | com o `@react-three/test-renderer` (grafo do three.js, sem WebGL): **cada prédio do JSON vira um objeto com a posição, o tamanho, a cor e o rótulo do arquivo**; trocar de trilha troca a cidade; a luz projeta sombra |
| `App.spec.tsx` | **loader traduzido** enquanto o chunk 3D não chega; depois, a cena com `aria-label`; troca de trilha e de idioma |

## Achados

1. **`castShadow` sozinho não faz nada.** Sem `shadows` no `<Canvas>`, sem a luz projetando e sem a câmera de sombra cobrindo a área, a cena fica sem sombra e nenhum erro aparece.
2. **O `Text` do drei, sem fonte, baixa a fonte de um CDN.** O motor de texto (troika) busca dados e fontes em `cdn.jsdelivr.net`: outra origem, sem controle de cache e indisponível offline. Com a fonte local, a página só chama o próprio servidor (conferido no Chrome). O troika lê `.woff`, não `.woff2`.
3. **Fonte em `public/` não serve aqui.** Arquivo estático sem hash fica até 4 h em cache no CDN da hospedagem. Importada pelo código, a fonte ganha hash e cache imutável.
4. **O layout é conteúdo, e conteúdo também precisa de regra.** Na primeira versão, o prédio mais alto ficava na frente e escondia os outros. A correção foi só no JSON (alto atrás, baixo na frente), sem tocar no código.
5. **Testar 3D sem navegador.** O `@react-three/test-renderer` monta o grafo do three.js no Node; o `Text` (que baixa fonte e usa Worker) é trocado por um marcador no teste. O render real foi conferido no Chrome headless com WebGL por software.

## Demo

Troque entre **Culinária** e **Idiomas**: o mesmo motor desenha cidades diferentes, e abaixo da cena aparece o arquivo que desenhou cada uma. Troque PT/EN para ver os rótulos 3D mudarem. Arraste para girar.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 13 testes
yarn dev      # demo em http://localhost:5173
```
