// As seções de uma instituição: pessoas, pedidos de matrícula, cursos e auditoria. Cada uma recebe só os dados da
// instituição em foco (no produto, o servidor já devolve filtrado pela sessão) e mostra as ações que o papel permite.
import { useState } from 'react';
import { can, type Actor } from '../../Domain/AdminAccess';
import type { EnrollmentRequest, Member } from '../../Domain/AdminRecords';
import { ConfirmDialog } from '../components/Dialog';
import { DataTable } from '../components/DataTable';
import { formatDate, useI18n } from '../i18n';
import type { AdminStore } from '../useAdminStore';

interface PageProps {
  actor: Actor;
  tenant: string;
  tenantName: string;
  store: AdminStore;
  notify: (msg: string) => void;
}

export function MembersPage({ actor, tenant, tenantName, store, notify }: PageProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState<Member | null>(null);
  const manage = can(actor, 'members.manage', { tenant });
  return (
    <>
      {!manage && <p className="note">{t('members.readOnly')}</p>}
      <DataTable
        caption={t('members.caption', { tenant: tenantName })}
        rows={store.members.filter((m) => m.tenant === tenant)}
        rowKey={(m) => m.id}
        searchFields={['name', 'email']}
        columns={[
          { field: 'name', label: t('members.name'), sortable: true },
          { field: 'email', label: t('members.email') },
          { field: 'role', label: t('members.role'), sortable: true, render: (m) => t(`role.${m.role}`) },
          { field: 'active', label: t('members.status'), render: (m) => <span className={`badge ${m.active ? 'ok' : 'off'}`}>{t(m.active ? 'status.memberActive' : 'status.memberInactive')}</span> },
        ]}
        actions={
          manage
            ? (m) =>
                m.active && (
                  <button type="button" className="button danger-ghost" onClick={() => setConfirming(m)} aria-label={`${t('members.deactivate')}: ${m.name}`}>
                    {t('members.deactivate')}
                  </button>
                )
            : undefined
        }
      />
      {confirming && (
        <ConfirmDialog
          title={t('members.confirmTitle', { name: confirming.name })}
          body={t('members.confirmBody')}
          confirm={t('members.deactivate')}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            store.deactivateMember(confirming.id);
            notify(t('members.deactivated.toast', { name: confirming.name }));
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}

export function EnrollmentsPage({ tenant, tenantName, store, notify }: PageProps) {
  const { t, language } = useI18n();
  const [rejecting, setRejecting] = useState<EnrollmentRequest | null>(null);
  return (
    <>
      <DataTable
        caption={t('enrollments.caption', { tenant: tenantName })}
        rows={store.requests.filter((r) => r.tenant === tenant)}
        rowKey={(r) => r.id}
        searchFields={['student', 'course']}
        empty={t('enrollments.empty')}
        columns={[
          { field: 'student', label: t('enrollments.student'), sortable: true },
          { field: 'course', label: t('enrollments.course'), sortable: true },
          { field: 'requestedAt', label: t('enrollments.requested'), sortable: true, render: (r) => formatDate(r.requestedAt, language) },
        ]}
        actions={(r) => (
          <>
            <button
              type="button"
              className="button primary"
              aria-label={`${t('enrollments.approve')}: ${r.student}`}
              onClick={() => {
                store.decideEnrollment(r.id, true);
                notify(t('enrollments.approved.toast', { name: r.student, course: r.course }));
              }}
            >
              {t('enrollments.approve')}
            </button>
            <button type="button" className="button danger-ghost" aria-label={`${t('enrollments.reject')}: ${r.student}`} onClick={() => setRejecting(r)}>
              {t('enrollments.reject')}
            </button>
          </>
        )}
      />
      {rejecting && (
        <ConfirmDialog
          title={t('enrollments.confirmTitle', { name: rejecting.student })}
          body={t('enrollments.confirmBody')}
          confirm={t('enrollments.reject')}
          onCancel={() => setRejecting(null)}
          onConfirm={() => {
            store.decideEnrollment(rejecting.id, false);
            notify(t('enrollments.rejected.toast', { name: rejecting.student }));
            setRejecting(null);
          }}
        />
      )}
    </>
  );
}

export function CoursesPage({ actor, tenant, tenantName, store, notify }: PageProps) {
  const { t } = useI18n();
  const names = new Map(store.members.map((m) => [m.id, m.name]));
  return (
    <DataTable
      caption={t('courses.caption', { tenant: tenantName })}
      rows={store.courses.filter((c) => c.tenant === tenant)}
      rowKey={(c) => c.id}
      searchFields={['title']}
      columns={[
        { field: 'title', label: t('courses.title'), sortable: true },
        { field: 'authors', label: t('courses.authors'), render: (c) => c.authors.map((a) => names.get(a) ?? a).join(', ') || '—' },
        { field: 'published', label: t('courses.status'), render: (c) => <span className={`badge ${c.published ? 'ok' : 'draft'}`}>{t(c.published ? 'status.published' : 'status.draft')}</span> },
      ]}
      actions={(c) =>
        can(actor, 'courses.edit', { tenant, course: c.id }) ? (
          <button
            type="button"
            className="button"
            aria-label={`${t(c.published ? 'courses.unpublish' : 'courses.publish')}: ${c.title}`}
            onClick={() => {
              store.togglePublish(c.id);
              notify(t(c.published ? 'courses.unpublished.toast' : 'courses.published.toast', { name: c.title }));
            }}
          >
            {t(c.published ? 'courses.unpublish' : 'courses.publish')}
          </button>
        ) : (
          <span className="hint">{t('courses.notYours')}</span>
        )
      }
    />
  );
}

export function AuditPage({ actor, tenant, store }: PageProps) {
  const { t } = useI18n();
  // O master da plataforma vê a auditoria de todas as instituições; os outros, só a da própria.
  const rows = store.audit.filter((a) => actor.role === 'platform_master' || a.tenant === tenant).map((a, i) => ({ ...a, id: `${a.at}-${i}`, what: t(`audit.${a.action}`) }));
  return (
    <DataTable
      caption={t('audit.caption')}
      rows={rows}
      rowKey={(a) => a.id}
      searchFields={['actor', 'target', 'what']}
      columns={[
        { field: 'at', label: t('audit.at'), sortable: true },
        { field: 'actor', label: t('audit.actor'), sortable: true },
        { field: 'what', label: t('audit.action') },
        { field: 'target', label: t('audit.target') },
      ]}
    />
  );
}
