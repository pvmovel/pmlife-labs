// Composition Root da demo: o ÚNICO lugar que conhece a Infrastructure (servidor em memória e a rede com falhas).
import { DeviceProgress } from '@application/UseCases/SyncProgress';
import { QuestCatalog } from '@domain/ProgressMerge';
import { FlakyLink, type LinkMode } from '@infrastructure/FlakyLink';
import { InMemoryProgressServer } from '@infrastructure/InMemoryProgressServer';
import data from '../../Content/catalog.json';

export type { LinkMode };

export interface DemoDevice {
  readonly id: 'phone' | 'pc';
  readonly link: { mode: LinkMode };
  progress: DeviceProgress;
  /** Antes de entrar na conta, o computador é um navegador de visitante com missões próprias. */
  guest: string[] | null;
}

export function createDemo() {
  const catalog = new QuestCatalog(data.trackId, data.quests);
  const server = new InMemoryProgressServer(new Map([[catalog.trackId, catalog]]));
  const make = (id: DemoDevice['id'], guest: string[] | null): DemoDevice => {
    const link = new FlakyLink(server);
    return { id, link, progress: new DeviceProgress('aluna-demo', catalog, link), guest };
  };
  return { catalog, server, devices: [make('phone', null), make('pc', [])] as const };
}
