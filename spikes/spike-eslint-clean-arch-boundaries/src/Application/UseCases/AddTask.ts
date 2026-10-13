// Application: caso de uso. Conhece o Port, nunca o adaptador concreto.
import { Task } from '@domain/Task';
import type { TaskRepository } from '../Ports/TaskRepository';

export class AddTask {
  constructor(private readonly repository: TaskRepository) {}

  async execute(id: string, title: string): Promise<Task> {
    const task = Task.create(id, title);
    await this.repository.save(task);
    return task;
  }
}
