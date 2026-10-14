// Domain: TypeScript puro. Títulos do projeto por idioma.
export type Language = 'pt-BR' | 'en-US';

export class ProjectTitles {
  static readonly DEFAULT = 'Minha Plataforma';

  private constructor(
    readonly pt: string,
    readonly en: string,
  ) {}

  /** Normaliza: título vazio cai no padrão; inglês vazio reaproveita o português. */
  static create(pt: string, en: string): ProjectTitles {
    const safePt = pt.trim() || ProjectTitles.DEFAULT;
    return new ProjectTitles(safePt, en.trim() || safePt);
  }

  forLanguage(language: Language): string {
    return language === 'en-US' ? this.en : this.pt;
  }
}
