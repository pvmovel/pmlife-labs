// Os cenários do Gherkin da US75 na tela: o master troca o objeto entre a parede e o chão no editor e publica; o sexto
// quadro e o objeto na frente da porta são recusados sem gravar nada; a sala nova tem paredes de 18 m com 5 quadros em
// cada uma, inclusive a da porta; e o totem no chão abre o vídeo pelo E, como na parede. A cena 3D é trocada por uma
// falsa que guarda as props (o 3D de verdade está no e2e).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '../Domain/Room';
import { App } from '../Presentation/App';
import { I18nProvider } from '../Presentation/i18n/I18n';

type SceneProps = { room: Room; onNearbyChange: (id: string | null) => void; paused: boolean; ariaLabel: string };
const scene: { props: SceneProps | null } = { props: null };
vi.mock('../Presentation/Engine3D/RoomCanvas', () => ({
  default: (props: SceneProps) => {
    useEffect(() => {
      scene.props = props;
    });
    return <div role="img" aria-label={props.ariaLabel} />;
  },
}));

const renderApp = async (initial: 'pt-BR' | 'en-US' = 'pt-BR') => {
  render(
    <I18nProvider initial={initial}>
      <App timeoutMs={60_000} />
    </I18nProvider>,
  );
  await waitFor(() => expect(scene.props).not.toBeNull());
};
const room = () => scene.props?.room as Room;
const itemOf = (id: string) => room().items.find((i) => i.id === id);
const set = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const publish = () => fireEvent.click(screen.getByTestId('publish'));
const problems = () => within(screen.getByTestId('editor-problems')).getAllByRole('listitem');

beforeEach(() => {
  scene.props = null;
});

describe('US75 na tela: no chão ou na parede', () => {
  it('Gherkin "Totem de vídeo no chão": no meio da sala, virado para a porta, e o E abre o vídeo como na parede', async () => {
    await renderApp();
    expect(itemOf('aula-1')).toMatchObject({ wall: 'north', offset: -6 });
    fireEvent.click(screen.getByTestId('place-aula-1-floor'));
    expect(screen.getByTestId('facing-aula-1')).toHaveValue('south');
    publish();
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Publicado.');
    expect(itemOf('aula-1')).toMatchObject({ placement: 'floor', x: 0, z: 0, facing: 'south' });
    act(() => scene.props?.onNearbyChange('aula-1'));
    expect(screen.getByTestId('totem-prompt')).toHaveTextContent('Aula 1: abertura do curso');
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.getByRole('dialog', { name: 'Vídeo: Aula 1: abertura do curso' })).toBeInTheDocument();
    expect(scene.props?.paused).toBe(true);
  });

  it('Gherkin "Quadro de texto como placa de aviso no chão": o mesmo texto, agora em pé no chão', async () => {
    await renderApp();
    fireEvent.click(screen.getByTestId('place-quadro-aviso-floor'));
    set('x-quadro-aviso', '2');
    set('z-quadro-aviso', '3');
    publish();
    expect(itemOf('quadro-aviso')).toMatchObject({ kind: 'board', placement: 'floor', x: 2, z: 3, textKey: 'items.aviso' });
    expect(screen.getByRole('img')).toHaveAccessibleName(/com 5 objetos nas paredes e 2 no chão/);
  });

  it('Gherkin "Sexto quadro na mesma parede": recusado com o aviso da parede norte, e nada é gravado', async () => {
    await renderApp();
    const before = room();
    set('add-wall', 'north');
    fireEvent.click(screen.getByTestId('add-board'));
    expect(problems().map((li) => li.textContent)).toContain('a parede norte já tem 5 quadros (“Quadro novo” não cabe)');
    expect(room()).toBe(before);
    // Em outra parede, cabe.
    set('add-wall', 'west');
    fireEvent.click(screen.getByTestId('add-board'));
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Quadro acrescentado na parede oeste.');
    expect(room().items).toHaveLength(before.items.length + 1);
  });

  it('Gherkin "Objeto no chão na frente da porta": a publicação é recusada, apontando o totem', async () => {
    await renderApp();
    const before = room();
    fireEvent.click(screen.getByTestId('place-aula-1-floor'));
    set('x-aula-1', '-6.5');
    set('z-aula-1', '7');
    publish();
    const li = problems().find((x) => x.dataset.code === 'FLOOR_ITEM_BLOCKS_DOOR');
    expect(li).toHaveTextContent('“Aula 1: abertura do curso” está no corredor da porta');
    expect(li?.dataset.item).toBe('aula-1');
    expect(room()).toBe(before);
  });

  it('os objetos do chão que fecham a passagem até as mesas são recusados, dizendo a mesa', async () => {
    await renderApp();
    // Os 7 objetos da sala no chão, lado a lado de parede a parede na altura z = 1 (frestas de 22,5 cm; o avatar tem
    // 1 m): a porta (sul) fica sem caminho até as duas mesas (norte). Os totens continuam alcançáveis pelo lado da porta.
    const row: [string, number][] = [['aula-1', -7.475], ['quadro-regras', -4.85], ['quadro-agenda', -2.225], ['quadro-metas', 0.4], ['aula-2', 3.025], ['quadro-aviso', 5.65], ['placa-boas-vindas', 7.875]];
    for (const [id, x] of row) {
      fireEvent.click(screen.getByTestId(`place-${id}-floor`));
      set(`x-${id}`, String(x));
      set(`z-${id}`, '1');
    }
    const before = room();
    publish();
    const blocked = problems().filter((li) => li.dataset.code === 'FLOOR_ITEM_BLOCKS_PATH').map((li) => li.textContent);
    expect(blocked).toEqual(['“Boas-vindas! Comece pela Aula 1” fecha a passagem até Mesa de leitura', '“Boas-vindas! Comece pela Aula 1” fecha a passagem até Mesa de prática']);
    expect(room()).toBe(before);
  });

  it('Gherkin "Sala nova com paredes maiores": 18 m, e cada parede aceita 5 quadros de 2,4 m, inclusive a da porta', async () => {
    await renderApp();
    fireEvent.click(screen.getByTestId('new-room'));
    expect(screen.getByTestId('editor-status')).toHaveTextContent('paredes de 18 m');
    expect(room()).toMatchObject({ halfSize: 9, doorX: -6.5, items: [] });
    set('add-wall', 'south');
    for (let k = 0; k < 5; k++) fireEvent.click(screen.getByTestId('add-board'));
    expect(room().items.filter((i) => i.wall === 'south')).toHaveLength(5);
    expect(screen.getByTestId('wall-counts')).toHaveTextContent('sul 5');
    fireEvent.click(screen.getByTestId('add-board'));
    expect(problems()[0].dataset.code).toBe('WALL_ITEMS_TOO_MANY');
  });

  it('Gherkin "Documento de antes continua igual": os objetos sem placement ficam na mesma parede e posição', async () => {
    await renderApp();
    expect(itemOf('quadro-aviso')).toEqual({ id: 'quadro-aviso', kind: 'board', textKey: 'items.aviso', width: 2.4, wall: 'east', offset: 0 });
    expect(screen.getByTestId('place-quadro-aviso-wall')).toBeChecked();
  });

  it('em inglês, o editor e os avisos vêm traduzidos', async () => {
    await renderApp('en-US');
    fireEvent.click(screen.getByTestId('add-board'));
    expect(problems()[0]).toHaveTextContent('the north wall already has 5 boards');
  });
});
