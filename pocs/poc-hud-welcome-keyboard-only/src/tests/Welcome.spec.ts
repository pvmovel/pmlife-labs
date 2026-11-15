// Quando a boas-vindas abre sozinha: na primeira visita e quando o conteúdo dela muda de versão; nunca de novo depois
// de fechada.
import { describe, expect, it } from 'vitest';
import { parseSeen, shouldShowWelcome } from '../Domain/Welcome';
import { answerFor, toCopilotAnswers } from '../Domain/Copilot';
import copilot from '../Content/copilot.json';

describe('boas-vindas', () => {
  it('abre na primeira visita e não abre depois de vista', () => {
    expect(shouldShowWelcome(null, 1)).toBe(true);
    expect(shouldShowWelcome(1, 1)).toBe(false);
  });
  it('abre de novo uma vez quando o que ela ensina muda de versão', () => {
    expect(shouldShowWelcome(1, 2)).toBe(true);
  });
  it('o que o aparelho guardou de estranho conta como não vista', () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen('abc')).toBeNull();
    expect(parseSeen('-1')).toBeNull();
    expect(parseSeen('2')).toBe(2);
  });
});

describe('Co-Pilot da demo', () => {
  const answers = toCopilotAnswers(copilot);
  it('responde por palavra-chave, sem acento nem maiúscula', () => {
    expect(answerFor('Como troco o MODO da câmera?', answers)).toBe('copilot.answers.mode');
    expect(answerFor('How do I open the chat?', answers)).toBe('copilot.answers.chat');
    expect(answerFor('qual é a capital da França?', answers)).toBeNull();
  });
});
