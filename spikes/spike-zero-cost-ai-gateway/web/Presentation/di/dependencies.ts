// Composition Root: único ponto da Presentation que conhece os adapters concretos.
import { AskTutorUseCase } from '../../Application/AskTutor';
import kb from '../../Content/knowledge_base.json';
import { HttpAiGatewayAdapter, StaticRagSearchAdapter } from '../../Infrastructure/adapters';

/** Na hospedagem, a demo (dist/) chama o endpoint PHP vizinho (public/ai_chat.php). */
export const AI_CHAT_URL = '../public/ai_chat.php';

export function createAskTutor(fetcher?: typeof fetch): AskTutorUseCase {
  return new AskTutorUseCase(new StaticRagSearchAdapter(kb.passages), new HttpAiGatewayAdapter(AI_CHAT_URL, fetcher));
}
