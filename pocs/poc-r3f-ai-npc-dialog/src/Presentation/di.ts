// Composition Root: o único lugar que instancia o adapter concreto.
import { TalkToNpcUseCase } from '../Application/TalkToNpc';
import { HttpNpcChatAdapter } from '../Infrastructure/HttpNpcChatAdapter';

/** Na hospedagem, a demo (dist/) chama o endpoint PHP vizinho (public/npc_chat.php). */
export const NPC_CHAT_URL = '../public/npc_chat.php';

export const talkToNpc = new TalkToNpcUseCase(new HttpNpcChatAdapter(NPC_CHAT_URL));
