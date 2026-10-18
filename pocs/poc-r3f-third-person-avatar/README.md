# PoC: avatar em 3ª pessoa no campus 3D

## O que esta PoC mostra

O aluno **anda pelo campus como num jogo**: um avatar controlado pelo teclado, com a câmera logo atrás dele, que **não atravessa prédios nem sai do mapa**. Um botão (ou a tecla **C**) troca para a **visão orbital**, que mostra o campus de cima e pode ser girada com o mouse ou com o dedo.

| Tecla | O que faz |
| :--- | :--- |
| **W** ou **↑** | anda para a frente |
| **S** ou **↓** | anda para trás |
| **A** ou **←** | gira para a esquerda |
| **D** ou **→** | gira para a direita |
| **C** | alterna Avatar ⇄ Orbital |

## Como funciona

```
src/
├── Content/campus.json              o mapa (limites, ponto de partida e prédios): dado, não código
├── Domain/
│   ├── Campus.ts                    formato do mapa + toCampus (confere o JSON campo a campo)
│   ├── Movement.ts                  step(): giro, deslocamento, limite do mapa e colisão com os prédios
│   └── FollowCamera.ts              onde a câmera quer ficar (atrás e acima) + suavização
└── Presentation/
    ├── NavigationModeToggle.tsx     Avatar ⇄ Orbital (botões com aria-pressed + tecla C)
    └── Engine3D/
        ├── AvatarCanvas.tsx         Canvas (React.lazy) + KeyboardControls (WASD e setas)
        ├── AvatarController.tsx     a cada quadro: lê as teclas ➔ Movement.step ➔ move o avatar
        ├── ThirdPersonCamera.tsx    persegue o ponto atrás do avatar
        ├── OrbitCamera.tsx          vista geral do mapa, girável
        └── Building3D.tsx           prédios com os rótulos da PoC da cidade 3D
```

| Técnica | Por quê |
| :--- | :--- |
| **Movimento no domínio** | Toda a regra (giro, velocidade, limites, colisão) é TypeScript puro, testada sem navegador. O React só lê o teclado e aplica o resultado a cada quadro. |
| **Colisão por eixo** | O avatar é uma caixa. O passo é resolvido primeiro em x e depois em z: quem encosta numa parede em diagonal **desliza** ao longo dela, em vez de travar. |
| **Sem atravessar paredes** | Passos longos são divididos em subpassos menores que o avatar, e o `dt` de cada quadro é limitado. Uma aba que volta do segundo plano não teleporta o avatar para dentro de um prédio. |
| **Câmera suave e independente do FPS** | A câmera se aproxima do alvo com fator `1 − e^(−k·dt)`: o movimento é igual a 30 ou a 144 quadros por segundo. |
| **Estado fora do React** | A posição do avatar fica numa `ref` compartilhada com a câmera: nada de re-render a cada quadro. O painel da página é atualizado cerca de 10 vezes por segundo. |
| **Quadros só quando precisa** | `frameloop="always"` no modo Avatar (há animação); `demand` na visão orbital, que só redesenha quando a câmera muda. |
| **Toque e acessibilidade** | Em tela de toque (`pointer: coarse`) a demo abre no modo Orbital. O seletor tem `aria-pressed` e o atalho é anunciado (`aria-keyshortcuts`). Ctrl+C continua copiando, e as setas não rolam a página no modo Avatar. |

### Testes

**No Node** (20 testes):

| Arquivo | O que prova |
| :--- | :--- |
| `Movement.spec.ts` | W/S andam na direção do avatar; A/D giram; frente e trás se anulam; **para na borda do mapa**; **para na parede do prédio**, inclusive num quadro muito lento; desliza em diagonal; JSON malformado é recusado; o ponto de partida é livre |
| `FollowCamera.spec.ts` | a câmera fica atrás e acima, converge para o alvo e **1 s a 30 ou a 60 quadros dá o mesmo ponto** |
| `NavigationModeToggle.spec.tsx` | clique e tecla C alternam; Ctrl+C e digitar num campo não alternam; toque abre em Orbital |
| `AvatarScene.spec.tsx` | com o `@react-three/test-renderer` e quadros avançados de verdade: o avatar anda no grafo do three.js e a câmera vai para trás dele; fora do modo Avatar ele não anda; a Orbital sobe para a vista geral |

**No Chrome headless** (`scripts/e2e.mjs`, teclas reais): W anda até a parede da biblioteca e **para**; ← gira e ↑ anda até a **borda** e para; as setas não rolam a página; o botão e a tecla C alternam os modos; no modo Orbital as teclas não movem o avatar; nenhum erro e **nenhuma requisição a outra origem**.

## Achados

1. **A regra do movimento cabe no domínio.** Separar `step()` do R3F deixou os dois cenários do Gherkin (andar e não atravessar) testáveis em milissegundos, sem WebGL. O e2e só confirma que o teclado de verdade chega lá.
2. **Colisão precisa de subpassos.** Com `dt` grande (aba em segundo plano, máquina lenta), um único passo pode pular uma parede inteira. Limitar o `dt` e dividir o passo resolve sem física pesada.
3. **A Orbital precisa "sair" de trás do avatar.** Na primeira versão, o `OrbitControls` assumia a câmera onde ela estava, colada no avatar, e a "visão do mapa" não mostrava o mapa. Ao entrar no modo, a câmera agora sobe para uma vista geral.
4. **A câmera olha acima do avatar.** Olhando para a altura do personagem, os rótulos dos prédios altos ficavam fora do quadro.
5. **O e2e espera condições, não tempos.** O FPS do Chrome headless (WebGL por software) varia. Por isso o teste segura a tecla até a posição chegar à parede ou à borda, e depois continua segurando para provar que ela não passa.

### Lacuna registrada

O avatar ainda **não anda por toque** (joystick virtual ou tocar para ir): no celular a demo abre na visão orbital, que funciona com o dedo. O controle por toque fica para uma demanda futura.

## Demo

Clique na cena (ou só comece a apertar as teclas): **W** anda até a Biblioteca e para na parede. Gire com **A**/**D** e explore. **C** troca para a visão orbital e volta.

## Como testar localmente

```bash
yarn install --frozen-lockfile
yarn verify   # fronteiras + tsc + 20 testes + e2e no Chrome headless (CHROME_PATH se não estiver em /usr/bin)
yarn dev      # demo em http://localhost:5173
```
