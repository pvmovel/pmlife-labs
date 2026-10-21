// Clique × arraste no 3D. No modo Orbital, arrastar gira a câmera; só um clique (ou toque) "parado" seleciona.
// O React Three Fiber entrega em `delta` quantos pixels o ponteiro andou entre apertar e soltar.

/** Até quantos pixels de movimento ainda é um clique (o dedo nunca fica perfeitamente parado num toque). */
export const CLICK_TOLERANCE_PX = 6;

/** Foi um clique/toque, e não o fim de um arraste da câmera? */
export const isClick = (delta: number, tolerance = CLICK_TOLERANCE_PX): boolean => delta <= tolerance;
