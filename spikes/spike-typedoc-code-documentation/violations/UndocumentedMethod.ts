/**
 * Violação proposital: a classe tem TSDoc, mas um método público não.
 */
export class MissionCatalog {
  /** Cria o catálogo vazio. */
  constructor() {}

  count(): number {
    return 0;
  }
}
