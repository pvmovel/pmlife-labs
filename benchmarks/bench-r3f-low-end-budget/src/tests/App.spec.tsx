// Sem WebGL (jsdom), a página avisa em vez de quebrar, nos dois idiomas; e os textos das duas línguas têm as mesmas chaves.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';
import ptBR from '../Content/Locales/pt-BR.json';
import enUS from '../Content/Locales/en-US.json';

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('a página do benchmark (US56)', () => {
  it('sem WebGL, avisa que o campus não roda, e troca de idioma', () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('não tem WebGL');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('alert')).toHaveTextContent('has no WebGL');
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '../../../catalogo/bench-r3f-low-end-budget/');
  });

  it('pt-BR e en-US têm as mesmas chaves', () => {
    expect(keys(enUS).sort()).toEqual(keys(ptBR).sort());
  });
});
