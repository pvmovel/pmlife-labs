// A trava de tamanho do CI (US56): compara os arquivos do build com o orçamento e diz qual passou e de quanto. Sem
// import nenhum, para o script do Node (scripts/size-budget.mjs) carregar este arquivo direto, sem build.
//
// Regras (a primeira que casar com o caminho vale): cada uma limita o tamanho com gzip de cada arquivo que casa;
// `total` limita a soma do bundle inicial (o que o index.html carrega antes da cena).

export interface SizeRule {
  /** Nome da regra, que aparece na falha. */
  name: string;
  /** Extensões que a regra pega (com o ponto), ou caminhos que começam com este prefixo. */
  match: { extensions?: string[]; prefix?: string };
  /** Limite por arquivo, em KB (com gzip). */
  maxKB: number;
}

export interface SizeBudgetConfig {
  rules: SizeRule[];
  /** Soma do bundle inicial, em KB com gzip. */
  initialKB: number;
}

export interface BuiltFile {
  path: string;
  /** Bytes com gzip. */
  gzipBytes: number;
  /** Carregado pelo index.html (o bundle inicial). */
  initial: boolean;
}

export interface SizeViolation {
  file: string;
  rule: string;
  kb: number;
  limitKB: number;
}

const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

export function ruleFor(path: string, rules: readonly SizeRule[]): SizeRule | null {
  const lower = path.toLowerCase();
  return (
    rules.find((r) => (r.match.prefix !== undefined && lower.startsWith(r.match.prefix.toLowerCase())) || (r.match.extensions ?? []).some((e) => lower.endsWith(e.toLowerCase()))) ?? null
  );
}

/** As violações do build: cada arquivo acima do limite da regra dele, e o bundle inicial acima do total. */
export function checkSizes(files: readonly BuiltFile[], config: SizeBudgetConfig): SizeViolation[] {
  const out: SizeViolation[] = [];
  for (const f of files) {
    const rule = ruleFor(f.path, config.rules);
    if (rule && kb(f.gzipBytes) > rule.maxKB) out.push({ file: f.path, rule: rule.name, kb: kb(f.gzipBytes), limitKB: rule.maxKB });
  }
  const initial = files.filter((f) => f.initial).reduce((s, f) => s + f.gzipBytes, 0);
  if (kb(initial) > config.initialKB) out.push({ file: '(bundle inicial)', rule: 'initial', kb: kb(initial), limitKB: config.initialKB });
  return out;
}

/** A linha da falha no CI: o arquivo, o tamanho e o limite. */
export function describeViolation(v: SizeViolation): string {
  return `${v.file}: ${v.kb} KB com gzip, acima do limite de ${v.limitKB} KB (regra ${v.rule})`;
}
