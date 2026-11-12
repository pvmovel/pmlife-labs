// As Matrículas da demo (US52): cada curso tem um método, e escolher o curso faz o que o botão dele faz. No curso por
// código, escolher não matricula: leva ao campo do código (o produto confere o código no servidor; aqui, um fixo).

export type EnrollMethod = 'free' | 'code' | 'approval';
export type EnrollStatus = 'none' | 'active' | 'pending';

/** O que escolher um curso nas Matrículas faz. */
export type EnrollChoice = { kind: 'enroll' } | { kind: 'request' } | { kind: 'ask-code' } | { kind: 'nothing' };

export function enrollChoice(method: EnrollMethod, status: EnrollStatus): EnrollChoice {
  if (status === 'active' || status === 'pending') return { kind: 'nothing' };
  if (method === 'code') return { kind: 'ask-code' };
  return method === 'approval' ? { kind: 'request' } : { kind: 'enroll' };
}

/** O código da demo (inventado), sem diferença de maiúsculas e espaços nas pontas. */
export const DEMO_CODE = 'AURORA-2026';

export function codeAccepted(typed: string): boolean {
  return typed.trim().toUpperCase() === DEMO_CODE;
}
