// "Já vi as boas-vindas" fica no aparelho (localStorage), como a preferência de idioma. Sem armazenamento (aba
// anônima com o site bloqueado, por exemplo), a janela abre e fecha normalmente; só não é lembrada.
import { parseSeen, WELCOME_VERSION } from '../Domain/Welcome';

const KEY = 'pmlife-labs.welcome-seen';

export function loadSeen(): number | null {
  try {
    return parseSeen(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveSeen(version: number = WELCOME_VERSION): void {
  try {
    window.localStorage.setItem(KEY, String(version));
  } catch {
    // sem armazenamento: a janela volta na próxima visita, e tudo continua funcionando
  }
}
