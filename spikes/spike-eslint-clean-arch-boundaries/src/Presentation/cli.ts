// Presentation: usa os casos de uso já montados pelo Composition Root.
import { messages } from '@content/messages';
import { container } from './di/container';

export async function run(title: string): Promise<string> {
  const task = await container.addTask.execute('1', title);
  return `${messages.added} ${task.title}`;
}
