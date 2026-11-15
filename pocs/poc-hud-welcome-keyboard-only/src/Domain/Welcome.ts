// Domain: quando a janela de boas-vindas abre sozinha (US78). Na primeira visita, e de novo só quando o conteúdo dela
// mudar de versão (uma tecla nova, por exemplo). Fechada, ela não volta sozinha; o H reabre a ajuda a qualquer momento.

/** Suba quando o que a janela ensina mudar: quem já viu a versão anterior vê a nova uma vez. */
export const WELCOME_VERSION = 1;

/** O que o aparelho guardou ("1", "2"…) como número, ou null quando não há nada válido. */
export function parseSeen(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function shouldShowWelcome(seen: number | null, version: number = WELCOME_VERSION): boolean {
  return seen === null || seen < version;
}
