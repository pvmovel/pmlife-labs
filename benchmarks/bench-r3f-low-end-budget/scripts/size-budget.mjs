// A trava de tamanho (US56): mede cada arquivo do build com gzip e compara com o orçamento de budget.json. Falha (saída 1)
// com o arquivo, o tamanho e o limite. O bundle inicial é o que o index.html carrega (scripts, módulos pré-carregados e
// estilos). Uso: node scripts/size-budget.mjs [pasta do build] [budget.json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { checkSizes, describeViolation } from '../src/Domain/SizeBudget.ts';

const dist = process.argv[2] ?? 'dist';
const budget = JSON.parse(readFileSync(process.argv[3] ?? 'budget.json', 'utf8')).size;

const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initialRefs = new Set([...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].map((m) => m[1]));

const files = walk(dist)
  .filter((f) => !f.endsWith('.html'))
  .map((f) => {
    const path = relative(dist, f).split('\\').join('/');
    return { path, gzipBytes: gzipSync(readFileSync(f), { level: 9 }).length, initial: initialRefs.has(path) };
  });

const violations = checkSizes(files, budget);
const initialKB = Math.round((files.filter((f) => f.initial).reduce((s, f) => s + f.gzipBytes, 0) / 1024) * 10) / 10;
const biggest = [...files].sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 5);
console.log(`trava de tamanho: ${files.length} arquivos; bundle inicial ${initialKB} KB com gzip (limite ${budget.initialKB} KB)`);
for (const f of biggest) console.log(`   ${(f.gzipBytes / 1024).toFixed(1).padStart(7)} KB  ${f.path}${f.initial ? '  (inicial)' : ''}`);
if (violations.length) {
  for (const v of violations) console.error(`❌ ${describeViolation(v)}`);
  process.exit(1);
}
console.log('✅ todos os arquivos dentro do orçamento');
