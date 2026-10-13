// Domain: TypeScript puro. Não importa nenhuma outra camada nem framework.
export class Task {
  private constructor(
    readonly id: string,
    readonly title: string,
    readonly done: boolean,
  ) {}

  static create(id: string, title: string): Task {
    const trimmed = title.trim();
    if (trimmed === '') throw new Error('TASK_TITLE_REQUIRED');
    return new Task(id, trimmed, false);
  }

  complete(): Task {
    return new Task(this.id, this.title, true);
  }
}
