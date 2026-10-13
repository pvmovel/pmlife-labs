// Composition Root: o ÚNICO ponto da Presentation autorizado a importar a Infrastructure.
// Aqui os adaptadores concretos são ligados aos casos de uso.
import { AddTask } from '@application/UseCases/AddTask';
import { InMemoryTaskRepository } from '@infrastructure/InMemoryTaskRepository';

const repository = new InMemoryTaskRepository();

export const container = {
  addTask: new AddTask(repository),
};
