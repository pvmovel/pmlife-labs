// Instituições (só o master da plataforma): a lista com busca e paginação, a criação com o master da instituição e a
// desativação confirmada.
import { useId, useState, type FormEvent } from 'react';
import type { Institution } from '../../Domain/AdminRecords';
import { slugFromName, validateInstitution, type InstitutionDraft, type InstitutionError } from '../../Domain/InstitutionForm';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { DataTable } from '../components/DataTable';
import { formatDate, useI18n } from '../i18n';
import type { AdminStore } from '../useAdminStore';

export function InstitutionsPage({ store, notify }: { store: AdminStore; notify: (msg: string) => void }) {
  const { t, language } = useI18n();
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<Institution | null>(null);

  const toggle = (i: Institution) => {
    store.toggleInstitution(i.slug);
    notify(t(i.active ? 'institutions.deactivated.toast' : 'institutions.reactivated.toast', { name: i.name }));
  };

  return (
    <>
      <div className="page-actions">
        <button type="button" className="button primary" onClick={() => setCreating(true)}>
          {t('institutions.new')}
        </button>
      </div>
      <DataTable
        caption={t('institutions.caption')}
        rows={store.institutions}
        rowKey={(i) => i.slug}
        searchFields={['name', 'slug']}
        columns={[
          { field: 'name', label: t('institutions.name'), sortable: true },
          { field: 'slug', label: t('institutions.slug'), render: (i) => <code>{i.slug}</code> },
          { field: 'members', label: t('institutions.members'), sortable: true },
          { field: 'createdAt', label: t('institutions.created'), sortable: true, render: (i) => formatDate(i.createdAt, language) },
          { field: 'active', label: t('institutions.status'), render: (i) => <span className={`badge ${i.active ? 'ok' : 'off'}`}>{t(i.active ? 'status.active' : 'status.inactive')}</span> },
        ]}
        actions={(i) =>
          i.active ? (
            <button type="button" className="button danger-ghost" onClick={() => setConfirming(i)} aria-label={`${t('institutions.deactivate')}: ${i.name}`}>
              {t('institutions.deactivate')}
            </button>
          ) : (
            <button type="button" className="button" onClick={() => toggle(i)} aria-label={`${t('institutions.reactivate')}: ${i.name}`}>
              {t('institutions.reactivate')}
            </button>
          )
        }
      />
      {creating && (
        <NewInstitutionDialog
          taken={store.institutions.map((i) => i.slug)}
          onCancel={() => setCreating(false)}
          onCreate={(d) => {
            const inst = store.createInstitution(d);
            setCreating(false);
            notify(t('institutions.created.toast', { name: inst.name, email: d.masterEmail.trim() }));
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={t('institutions.confirmTitle', { name: confirming.name })}
          body={t('institutions.confirmBody')}
          confirm={t('institutions.deactivate')}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            toggle(confirming);
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}

function NewInstitutionDialog({ taken, onCancel, onCreate }: { taken: readonly string[]; onCancel: () => void; onCreate: (d: InstitutionDraft) => void }) {
  const { t } = useI18n();
  const ids = { name: useId(), slug: useId(), masterEmail: useId(), summary: useId() };
  const [draft, setDraft] = useState<InstitutionDraft>({ name: '', slug: '', masterEmail: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof InstitutionDraft, InstitutionError>>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateInstitution(draft, taken);
    setErrors(found);
    if (Object.keys(found).length === 0) onCreate(draft);
    else document.getElementById(ids[Object.keys(found)[0] as keyof InstitutionDraft])?.focus();
  };

  const field = (key: keyof InstitutionDraft, label: string, type: string, hint?: string) => (
    <div className="field">
      <label htmlFor={ids[key]}>{label}</label>
      <input
        id={ids[key]}
        type={type}
        value={draft[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={[hint && `${ids[key]}-hint`, errors[key] && `${ids[key]}-error`].filter(Boolean).join(' ') || undefined}
        onChange={(e) => {
          const value = e.target.value;
          setDraft((d) => ({ ...d, [key]: value, ...(key === 'name' && !slugEdited ? { slug: slugFromName(value) } : {}) }));
          if (key === 'slug') setSlugEdited(true);
        }}
      />
      {hint && (
        <span id={`${ids[key]}-hint`} className="hint">
          {hint}
        </span>
      )}
      {errors[key] && (
        <span id={`${ids[key]}-error`} className="field-error">
          {t(`error.${errors[key]}`)}
        </span>
      )}
    </div>
  );

  return (
    <Dialog title={t('form.title')} onClose={onCancel}>
      <form onSubmit={submit} noValidate aria-describedby={Object.keys(errors).length ? ids.summary : undefined}>
        {Object.keys(errors).length > 0 && (
          <p id={ids.summary} className="form-alert" role="alert">
            {t('form.errorSummary')}
          </p>
        )}
        {field('name', t('form.name'), 'text')}
        {field('slug', t('form.slug'), 'text', t('form.slugHint'))}
        {field('masterEmail', t('form.masterEmail'), 'email', t('form.masterHint'))}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onCancel}>
            {t('form.cancel')}
          </button>
          <button type="submit" className="button primary">
            {t('form.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
