// Lê os documentos e roda um caso de conformidade (cases/*.json). O php/verify.php faz exatamente o mesmo: front e
// servidor precisam chegar ao mesmo nível, aos mesmos pontos e às mesmas fases bloqueadas.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Completion, CourseDoc, CourseHistory, LevelDoc } from '@domain/CourseDocument';
import { CourseProgress } from '@domain/CourseProgress';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export interface ConformanceCase {
  readonly course: string;
  readonly description: string;
  readonly gherkin?: string;
  readonly versions: readonly number[];
  /** Substitui a escada da versão atual (para provar uma regra da escada sem outro curso). */
  readonly levels?: readonly LevelDoc[];
  readonly completions: readonly Completion[];
  readonly attempts: readonly string[];
  readonly expect: unknown;
}

export function readDoc(course: string, version: number): CourseDoc {
  return JSON.parse(readFileSync(path.join(ROOT, 'src', 'Content', course, `v${version}.json`), 'utf8')) as CourseDoc;
}

export function history(course: string, versions: readonly number[], levels?: readonly LevelDoc[]): CourseHistory {
  const latest = Math.max(...versions);
  return new Map(versions.map((v) => {
    const doc = readDoc(course, v);
    return [v, v === latest && levels ? { ...doc, levels } : doc];
  }));
}

export function loadCases(): [string, ConformanceCase][] {
  const dir = path.join(ROOT, 'cases');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as ConformanceCase]);
}

/** O resultado de um caso, no formato do `expect`. */
export function evaluate(c: ConformanceCase) {
  let progress = new CourseProgress(history(c.course, c.versions, c.levels), c.completions);
  const attempts = c.attempts.map((questId) => {
    const a = progress.attempt(questId);
    if (!a.ok) return `${questId}!${a.code}`;
    progress = progress.with(a.completion);
    return `${questId}@${a.completion.version}`;
  });
  const { current, next } = progress.level();
  return {
    attempts,
    xp: progress.xp,
    attributes: progress.attributes,
    level: current.id,
    next: next && { level: next.level.id, missing: next.missing },
    phases: progress.phases(),
  };
}
