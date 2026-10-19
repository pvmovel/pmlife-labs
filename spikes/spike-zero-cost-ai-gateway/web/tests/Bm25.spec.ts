import { describe, expect, it } from 'vitest';
import { Bm25Index, tokenize } from '../Domain/Bm25';
import kb from '../Content/knowledge_base.json';

const index = new Bm25Index(kb.passages);
const top = (q: string) => index.search(q, 3).map((h) => h.passage.id);

describe('BM25 (busca no material do curso)', () => {
  it('normaliza: minúsculas, sem acento, sem stopwords, plural simples', () => {
    expect(tokenize('Quando acontecem as Luas e os eclipses?')).toEqual(['acontecem', 'lua', 'eclipse']);
  });

  it('acha o trecho certo em primeiro lugar', () => {
    expect(top('Quando acontece o eclipse lunar?')[0]).toBe('eclipse-lunar');
    expect(top('qual telescópio usa espelhos?')[0]).toBe('telescopio-tipos');
    expect(top('Como ganho o certificado do clube?')[0]).toBe('clube-certificado');
  });

  it('não depende de acento nem de maiúsculas', () => {
    expect(top('POLUICAO LUMINOSA')[0]).toBe('poluicao-luminosa');
  });

  it('devolve no máximo k trechos, do mais para o menos relevante', () => {
    const hits = index.search('lua nova eclipse sol', 3);
    expect(hits).toHaveLength(3);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
    expect(hits[1].score).toBeGreaterThanOrEqual(hits[2].score);
  });

  it('pergunta fora do material: nenhum trecho (o tutor diz que o curso não cobre)', () => {
    expect(index.search('receita de bolo de chocolate', 3)).toEqual([]);
  });
});
