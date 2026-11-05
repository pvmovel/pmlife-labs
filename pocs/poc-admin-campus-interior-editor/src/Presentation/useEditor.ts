// O estado do editor: as instituições da demo (cada uma com os seus documentos, isoladas como no servidor), o documento
// aberto, o que a planta mostra (a cidade ou o interior de um prédio), o item selecionado, os problemas (recalculados a
// cada edição) e a visão do aluno (a versão publicada). As regras estão todas no Domain.
import { useCallback, useMemo, useState } from 'react';
import { demoInstitutions, type DemoInstitution } from '../Content/fakeWorlds';
import { copyForEditing, discardDraft, publish, published, saveDraft, versionOf, working, type WorldDocument } from '../Domain/Drafts';
import { buildingOfPath, selectionAt, type Selection } from '../Domain/editing';
import { validateWorld, type Problem } from '../Domain/validateWorld';
import type { World } from '../Domain/World';

/** O que a planta mostra. */
export type View = { readonly kind: 'city' } | { readonly kind: 'interior'; readonly buildingId: string };

export interface Editor {
  readonly institutions: readonly DemoInstitution[];
  readonly institution: DemoInstitution;
  readonly doc: WorldDocument;
  /** O mundo na tela: o rascunho (ou a versão publicada), ou a publicada na visão do aluno. */
  readonly world: World;
  readonly editable: boolean;
  readonly version: number;
  readonly hasDraft: boolean;
  readonly problems: readonly Problem[];
  readonly view: View;
  readonly selection: Selection | null;
  readonly studentView: boolean;
  setInstitution: (slug: string) => void;
  openDocument: (id: string) => void;
  setView: (view: View) => void;
  select: (sel: Selection | null) => void;
  /** Aplica uma edição pura ao rascunho. */
  edit: (change: (w: World) => World) => void;
  /** Publica: devolve a versão nova, ou os problemas. */
  publishDraft: () => { ok: true; version: number } | { ok: false; problems: readonly Problem[] };
  discard: () => void;
  /** Copia o documento da plataforma para a instituição e abre a cópia. */
  copy: (title: { pt: string; en: string }) => void;
  setStudentView: (on: boolean) => void;
  /** Vai ao item de um problema: abre o interior certo e o seleciona. */
  focusProblem: (p: Problem) => void;
}

export function useEditor(initial?: { institution?: string; document?: string }): Editor {
  const [institutions, setInstitutions] = useState<DemoInstitution[]>(() => demoInstitutions());
  const [slug, setSlug] = useState(initial?.institution ?? 'aurora');
  const institution = institutions.find((i) => i.slug === slug) ?? institutions[0];
  const [docId, setDocId] = useState(initial?.document ?? institution.documents[0].id);
  const doc = institution.documents.find((d) => d.id === docId) ?? institution.documents[0];
  const [view, setViewState] = useState<View>({ kind: 'city' });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [studentView, setStudentView] = useState(false);

  const world = studentView ? published(doc) : working(doc);
  const problems = useMemo(() => (studentView ? [] : validateWorld(working(doc))), [doc, studentView]);

  const replaceDoc = useCallback(
    (next: WorldDocument) =>
      setInstitutions((list) => list.map((i) => (i.slug !== institution.slug ? i : { ...i, documents: i.documents.some((d) => d.id === next.id) ? i.documents.map((d) => (d.id === next.id ? next : d)) : [...i.documents, next] }))),
    [institution.slug],
  );

  const reset = () => {
    setViewState({ kind: 'city' });
    setSelection(null);
    setStudentView(false);
  };

  return {
    institutions,
    institution,
    doc,
    world,
    editable: doc.source === 'tenant' && !studentView,
    version: versionOf(doc),
    hasDraft: doc.draft !== null,
    problems,
    view,
    selection,
    studentView,
    setInstitution: (s) => {
      setSlug(s);
      setDocId((institutions.find((i) => i.slug === s) ?? institutions[0]).documents[0].id);
      reset();
    },
    openDocument: (id) => {
      setDocId(id);
      reset();
    },
    setView: (v) => {
      setViewState(v);
      setSelection(null);
    },
    select: setSelection,
    edit: (change) => {
      if (doc.source !== 'tenant' || studentView) return;
      const before = working(doc);
      const after = change(before);
      // Uma edição que não muda nada (abrir um interior que já existe) não cria rascunho.
      if (after !== before) replaceDoc(saveDraft(doc, after));
    },
    publishDraft: () => {
      const r = publish(doc);
      if (!r.ok) return r;
      replaceDoc(r.doc);
      return { ok: true, version: r.version };
    },
    discard: () => {
      replaceDoc(discardDraft(doc));
      setSelection(null);
    },
    copy: (title) => {
      const id = `${doc.id}-copia`;
      replaceDoc(copyForEditing(doc, id, title));
      setDocId(id);
      reset();
    },
    setStudentView: (on) => {
      setStudentView(on);
      setSelection(null);
    },
    focusProblem: (p) => {
      const w = working(doc);
      const inside = buildingOfPath(w, p.path);
      setViewState(inside ? { kind: 'interior', buildingId: inside } : { kind: 'city' });
      setSelection(selectionAt(w, p.path));
    },
  };
}
