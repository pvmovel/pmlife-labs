// Fallback sem OPFS (e repositório dos testes): mesmo Port, dados só até fechar a aba.
import type { ProgressRepository } from '../Application/Ports/ProgressRepository';
import type { ProgressSnapshot } from '../Domain/ProgressSnapshot';

export class InMemoryProgressRepository implements ProgressRepository {
  private readonly data = new Map<string, ProgressSnapshot>();

  async load(trackId: string): Promise<ProgressSnapshot | null> {
    const s = this.data.get(trackId);
    return s ? { ...s, completedMissions: [...s.completedMissions] } : null;
  }

  async save(snapshot: ProgressSnapshot): Promise<void> {
    this.data.set(snapshot.trackId, { ...snapshot, completedMissions: [...snapshot.completedMissions] });
  }
}
