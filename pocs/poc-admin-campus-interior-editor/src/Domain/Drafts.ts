// Rascunho e publicação (o mesmo ciclo que o servidor guarda, um rascunho por documento): editar mexe só no rascunho;
// publicar valida, cria a versão nova e apaga o rascunho; o aluno vê sempre a última versão publicada. Um documento da
// plataforma (o curso vinculado) não se edita: copiar cria um documento da instituição, que passa a ser dela.
import { validateWorld, type Problem } from './validateWorld';
import type { CityKind, Label, World } from './World';

/** Um documento editável: uma cidade, com as versões publicadas e, se houver, o rascunho. */
export interface WorldDocument {
  readonly id: string;
  readonly title: Label;
  readonly kind: CityKind;
  /** `tenant`: da instituição (edita); `platform`: curso vinculado (só ver e copiar). */
  readonly source: 'tenant' | 'platform';
  /** As versões publicadas, da primeira para a última. */
  readonly versions: readonly World[];
  readonly draft: World | null;
}

/** O resultado de publicar: a versão nova, ou os problemas que impedem. */
export type PublishResult = { readonly ok: true; readonly doc: WorldDocument; readonly version: number } | { readonly ok: false; readonly problems: readonly Problem[] };

/** A última versão publicada (o que o aluno vê). */
export const published = (doc: WorldDocument): World => doc.versions[doc.versions.length - 1];

/** O que o editor mostra: o rascunho, ou a versão publicada se não há rascunho. */
export const working = (doc: WorldDocument): World => doc.draft ?? published(doc);

/** A versão publicada atual, a partir de 1. */
export const versionOf = (doc: WorldDocument): number => doc.versions.length;

/**
 * Grava uma edição no rascunho.
 *
 * @throws Error se o documento é da plataforma (não se edita: copie antes).
 */
export function saveDraft(doc: WorldDocument, world: World): WorldDocument {
  if (doc.source !== 'tenant') throw new Error('documento da plataforma: copie para editar');
  return { ...doc, draft: world };
}

/** Descarta o rascunho: volta à versão publicada. */
export const discardDraft = (doc: WorldDocument): WorldDocument => ({ ...doc, draft: null });

/**
 * Publica o rascunho, se ele passa na validação.
 *
 * @returns A versão nova (e o rascunho apagado), ou os problemas.
 */
export function publish(doc: WorldDocument): PublishResult {
  if (!doc.draft) return { ok: true, doc, version: versionOf(doc) };
  const problems = validateWorld(doc.draft);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, doc: { ...doc, versions: [...doc.versions, doc.draft], draft: null }, version: doc.versions.length + 1 };
}

/**
 * Copia um documento (da plataforma) para a instituição editar: a cópia começa na versão publicada dele.
 *
 * @param doc - O original.
 * @param id - O id da cópia.
 * @param title - O título da cópia.
 * @returns A cópia, da instituição, na versão 1.
 */
export const copyForEditing = (doc: WorldDocument, id: string, title: Label): WorldDocument => ({ id, title, kind: doc.kind, source: 'tenant', versions: [published(doc)], draft: null });
