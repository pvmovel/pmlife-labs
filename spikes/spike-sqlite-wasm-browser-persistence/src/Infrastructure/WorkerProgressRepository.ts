// Adapter: implementa o Port conversando com o Worker do SQLite (cada chamada vira uma mensagem com id).
import type { ProgressRepository } from '../Application/Ports/ProgressRepository';
import type { ProgressSnapshot } from '../Domain/ProgressSnapshot';
import type { BenchResult, InitResult, Request, Response } from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Op = Request extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

export class WorkerProgressRepository implements ProgressRepository {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<Response>) => {
      const res = event.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res.result);
      else p.reject(new Error(res.error));
    };
  }

  private call<T>(op: Op): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...op, id });
    });
  }

  init = () => this.call<InitResult>({ op: 'init' });
  load = (trackId: string) => this.call<ProgressSnapshot | null>({ op: 'load', trackId });
  save = (snapshot: ProgressSnapshot) => this.call<void>({ op: 'save', snapshot });
  clear = () => this.call<void>({ op: 'clear' });
  bench = () => this.call<BenchResult>({ op: 'bench' });

  terminate(): void {
    this.worker.terminate();
  }
}
