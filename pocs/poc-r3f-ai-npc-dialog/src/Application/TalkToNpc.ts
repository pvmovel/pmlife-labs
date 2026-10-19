// Application: conversar com um NPC. O caso de uso não sabe de HTTP nem de React; fala com o servidor por uma porta.
//
// Memória curta (decisão do produto): a cada pergunta vão só as 3 últimas trocas. Isso basta para "e o
// segundo?" fazer sentido e mantém o pedido pequeno (cota e tempo do provedor de IA).

/** Uma troca da conversa: a pergunta do aluno e a resposta do NPC. */
export interface Turn {
  readonly question: string;
  readonly answer: string;
}

export interface NpcChatRequest {
  readonly persona: string;
  readonly message: string;
  /** As últimas trocas, da mais antiga para a mais recente. */
  readonly history: readonly Turn[];
  readonly lang: string;
}

/** Porta: quem responde pelo NPC (no labs, um mock em PHP; no produto, o gateway de IA). */
export interface NpcChatPort {
  reply(request: NpcChatRequest): Promise<string>;
}

/** Códigos de erro do contrato, mais os do próprio cliente (EMPTY, TOO_LONG, NETWORK). */
export type NpcChatErrorCode = 'INVALID_PERSONA' | 'INVALID_REQUEST' | 'RATE_LIMITED' | 'AI_UNAVAILABLE' | 'EMPTY' | 'TOO_LONG' | 'NETWORK';

export class NpcChatError extends Error {
  constructor(readonly code: NpcChatErrorCode) {
    super(code);
    this.name = 'NpcChatError';
  }
}

export const MAX_HISTORY_TURNS = 3;
export const MAX_NPC_MESSAGE = 500;

/** As `max` trocas mais recentes (as mais antigas ficam só na tela). */
export const recentHistory = (turns: readonly Turn[], max = MAX_HISTORY_TURNS): Turn[] => (max > 0 ? turns.slice(-max) : []);

export class TalkToNpcUseCase {
  constructor(private readonly chat: NpcChatPort) {}

  /** Envia a pergunta com a memória curta e devolve a nova troca. A conversa inteira fica com quem chama. */
  async execute(persona: string, message: string, conversation: readonly Turn[], lang: string): Promise<Turn> {
    const question = message.trim();
    if (!question) throw new NpcChatError('EMPTY');
    if (question.length > MAX_NPC_MESSAGE) throw new NpcChatError('TOO_LONG');
    const answer = await this.chat.reply({ persona, message: question, history: recentHistory(conversation), lang });
    return { question, answer };
  }
}
