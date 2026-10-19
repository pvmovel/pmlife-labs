// Modal acessível: aria-modal + título, foco preso dentro, Esc fecha e o foco volta para onde estava.
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Modal } from '../Presentation/HUD/Modal';
import { renderGuide } from '../Presentation/HUD/HelpModal';
import { I18nProvider } from '../Presentation/i18n/I18n';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <I18nProvider>
      <button type="button" onClick={() => setOpen(true)}>abrir</button>
      {open && (
        <Modal title="Janela" onClose={() => setOpen(false)}>
          <a href="#x">link</a>
        </Modal>
      )}
    </I18nProvider>
  );
}

describe('Modal', () => {
  it('é um diálogo modal com título, foco preso dentro e Esc devolve o foco', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'abrir' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Janela' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const close = screen.getByRole('button', { name: /Fechar/ });
    const link = screen.getByRole('link', { name: 'link' });
    expect(close).toHaveFocus();

    // Tab no último volta para o primeiro; Shift+Tab no primeiro vai para o último
    link.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(link).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('guia em Markdown', () => {
  it('vira HTML e é sanitizado (sem script, handlers on* nem javascript:)', () => {
    const html = renderGuide('## Título\n\n<script>alert(1)</script><img src=x onerror="alert(2)">\n\n[clique](javascript:alert(3))');
    expect(html).toContain('<h2>Título</h2>');
    expect(html).toContain('clique'); // o texto do link fica; o href perigoso, não
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
  });
});
