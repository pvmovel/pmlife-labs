// O estado da tela: o papel da demonstração, os cursos da instituição (como o servidor os guarda: versões e rascunho),
// o curso aberto, a aba, a fase das missões, os problemas (recalculados a cada edição) e a visão do aluno. As regras
// estão todas no Domain; aqui só se guarda e se chama.
import { useCallback, useMemo, useState } from 'react';
import { COURSE_TEMPLATE, DEMO_INSTITUTION } from '../Content/institution';
import type { Course } from '../Domain/Course';
import { canCreateCourse, newDocument, publish, published, saveDraft, working, type CourseDocument, type Role } from '../Domain/Drafts';
import { fromTemplate, newCourseErrors, type NewCourseError, type NewCourseInput } from '../Domain/template';
import { validateCourse, type Problem } from '../Domain/validateCourse';

/** As partes do curso no editor. */
export type Tab = 'course' | 'phases' | 'quests';

/** O resultado de criar um curso: criado, os erros do formulário, ou a recusa do servidor. */
export type CreateResult = { readonly kind: 'created' } | { readonly kind: 'invalid'; readonly errors: Partial<Record<'slug' | 'title', NewCourseError>> } | { readonly kind: 'forbidden' };

export interface Builder {
  readonly role: Role;
  readonly courses: readonly CourseDocument[];
  readonly doc: CourseDocument | null;
  /** O curso na tela: o rascunho (ou a última versão); na visão do aluno, a publicada. */
  readonly course: Course | null;
  readonly problems: readonly Problem[];
  readonly tab: Tab;
  readonly phase: number;
  readonly studentView: boolean;
  setRole: (role: Role) => void;
  /** Cria o curso a partir do modelo. O "servidor" confere o papel, como a AdminPolicy. */
  create: (input: NewCourseInput) => CreateResult;
  open: (slug: string | null) => void;
  setTab: (tab: Tab) => void;
  setPhase: (index: number) => void;
  /** Aplica uma edição pura ao rascunho. */
  edit: (change: (c: Course) => Course) => void;
  publishDraft: () => { ok: true; version: number } | { ok: false; problems: readonly Problem[] };
  setStudentView: (on: boolean) => void;
}

const CATALOG = DEMO_INSTITUTION.attributes.map((a) => a.id);

export function useBuilder(initial: { role?: Role; courses?: CourseDocument[] } = {}): Builder {
  const [role, setRole] = useState<Role>(initial.role ?? 'tenant_admin');
  const [courses, setCourses] = useState<CourseDocument[]>(initial.courses ?? []);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('course');
  const [phase, setPhase] = useState(0);
  const [studentView, setStudentView] = useState(false);

  const doc = courses.find((c) => c.slug === openSlug) ?? null;
  const course = doc ? (studentView ? published(doc) : working(doc)) : null;
  const problems = useMemo(() => (doc && !studentView ? validateCourse(working(doc), CATALOG) : []), [doc, studentView]);

  const replace = useCallback((next: CourseDocument) => setCourses((list) => list.map((d) => (d.slug === next.slug ? next : d))), []);

  const create = (input: NewCourseInput): CreateResult => {
    if (!canCreateCourse(role)) return { kind: 'forbidden' };
    const errors = newCourseErrors(input, courses.map((c) => c.slug));
    if (Object.keys(errors).length > 0) return { kind: 'invalid', errors };
    const next = newDocument(input.slug.trim(), fromTemplate(COURSE_TEMPLATE, DEMO_INSTITUTION.slug, input));
    setCourses((list) => [...list, next]);
    setOpenSlug(next.slug);
    setTab('course');
    setPhase(0);
    setStudentView(false);
    return { kind: 'created' };
  };

  const edit = (change: (c: Course) => Course) => {
    if (!doc || studentView) return;
    const before = working(doc);
    const after = change(before);
    if (after !== before) replace(saveDraft(doc, after));
  };

  const publishDraft = () => {
    if (!doc) return { ok: false as const, problems: [] };
    const r = publish(doc, CATALOG);
    if (!r.ok) return { ok: false as const, problems: r.problems };
    replace(r.doc);
    return { ok: true as const, version: r.version };
  };

  return {
    role,
    courses,
    doc,
    course,
    problems,
    tab,
    phase: Math.min(phase, Math.max(0, (course?.phases.length ?? 1) - 1)),
    studentView,
    setRole,
    create,
    open: (slug) => {
      setOpenSlug(slug);
      setStudentView(false);
      setTab('course');
    },
    setTab,
    setPhase,
    edit,
    publishDraft,
    setStudentView,
  };
}
