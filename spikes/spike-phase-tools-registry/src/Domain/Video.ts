// Domain: o formato "videoRef" do registro, igual ao do totem do produto (US46, ADR-022): só a plataforma e os IDs,
// nunca um link nem HTML. TypeScript puro.

/** O ID de um vídeo do YouTube (o formato "youtubeId", o videoId da US38). */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Os campos de cada plataforma: os obrigatórios e os opcionais (nenhum outro é aceito). */
const FIELDS: Readonly<Record<string, { readonly required: Readonly<Record<string, RegExp>>; readonly optional: Readonly<Record<string, RegExp | true>> }>> = {
  youtube: { required: { id: VIDEO_ID }, optional: {} },
  vimeo: { required: { id: /^[1-9][0-9]{0,11}$/ }, optional: { hash: /^[0-9a-f]{6,20}$/ } },
  panda: { required: { zone: /^[0-9a-z]{8}-[0-9a-z]{3}$/, id: UUID }, optional: {} },
  bunny: { required: { library: /^[1-9][0-9]{0,9}$/, id: UUID }, optional: { legacy: true } },
};

/** O problema do objeto `video`, ou null. */
export function videoRefProblem(value: unknown): 'FIELD_TYPE' | 'VIDEO_PROVIDER_UNKNOWN' | 'VIDEO_INVALID' | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'FIELD_TYPE';
  const v = value as Readonly<Record<string, unknown>>;
  if (typeof v.provider !== 'string' || !(v.provider in FIELDS)) return 'VIDEO_PROVIDER_UNKNOWN';
  const { required, optional } = FIELDS[v.provider];
  for (const [key, re] of Object.entries(required)) if (typeof v[key] !== 'string' || !re.test(v[key])) return 'VIDEO_INVALID';
  for (const key of Object.keys(v)) {
    if (key === 'provider' || key in required) continue;
    const rule = optional[key];
    if (rule === undefined) return 'VIDEO_INVALID';
    if (rule === true ? v[key] !== true : typeof v[key] !== 'string' || !rule.test(v[key])) return 'VIDEO_INVALID';
  }
  return null;
}
