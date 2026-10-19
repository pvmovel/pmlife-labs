// Guia do aluno (tecla H): o texto é um Markdown versionado em src/Content/Guides/<idioma>/ (fonte única),
// importado com ?raw, convertido com marked e sanitizado com DOMPurify antes de entrar na página.
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';
import guidePt from '../../Content/Guides/pt-BR/GUIA_DO_ALUNO.md?raw';
import guideEn from '../../Content/Guides/en-US/GUIA_DO_ALUNO.md?raw';
import { useI18n, type Language } from '../i18n/I18n';
import { Modal } from './Modal';

const GUIDES: Record<Language, string> = { 'pt-BR': guidePt, 'en-US': guideEn };

/** Markdown ➔ HTML seguro (sem script, sem handlers on*, sem javascript: em links). */
export function renderGuide(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(markdown, { async: false }));
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  const { language, t } = useI18n();
  const html = useMemo(() => renderGuide(GUIDES[language]), [language]);
  return (
    <Modal title={t('help.title')} onClose={onClose} testId="help-modal">
      <div className="guide" dangerouslySetInnerHTML={{ __html: html }} />
    </Modal>
  );
}
