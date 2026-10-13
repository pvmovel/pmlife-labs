// Application: contrato (Port). Depende só do Domain.
import type { Task } from '@domain/Task';

export interface TaskRepository {
  save(task: Task): Promise<void>;
  findAll(): Promise<Task[]>;
}
