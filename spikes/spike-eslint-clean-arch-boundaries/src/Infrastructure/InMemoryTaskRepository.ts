// Infrastructure: adaptador concreto do Port. Pode depender de Application e Domain.
import type { TaskRepository } from '@application/Ports/TaskRepository';
import type { Task } from '@domain/Task';

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async findAll(): Promise<Task[]> {
    return [...this.tasks.values()];
  }
}
