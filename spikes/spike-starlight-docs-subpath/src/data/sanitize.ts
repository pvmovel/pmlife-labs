// O que nunca pode ir para uma página pública: o mapa do repositório é interno, o site é público.
// As regras trocam o detalhe por um texto genérico; a lista FORBIDDEN é a trava final (o build falha se algo escapar).
import type { SanitizeRule } from '../lib/structureMap';

export const SANITIZE_RULES: readonly SanitizeRule[] = [
  // Arquivos de ambiente (com o nome do ambiente) e o caminho deles.
  { pattern: /`?~?\/?[\w.-]*\.env\.php`?/g, replacement: { pt: '[arquivo de ambiente]', en: '[environment file]' } },
  // Caminhos absolutos do servidor.
  { pattern: /`?\/home\d*\/[\w./-]+`?/g, replacement: { pt: '[pasta do servidor]', en: '[server folder]' } },
  // Credenciais de exemplo ou reais (NOME=valor).
  { pattern: /`?\b(DB_PASS|DB_USER|[A-Z_]*API_KEY|[A-Z_]*SALT)=[^`\s)]*`?/g, replacement: { pt: '[credencial]', en: '[credential]' } },
];

export const FORBIDDEN: readonly RegExp[] = [/\.env\.php/, /\/home\d*\//, /public_html/, /\b(DB_PASS|API_KEY|SALT)=/];
