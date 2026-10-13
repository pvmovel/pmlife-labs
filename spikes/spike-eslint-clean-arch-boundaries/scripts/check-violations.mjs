// Prova que a config funciona nos dois sentidos:
//   1. src/ (arquitetura correta, incluindo o Composition Root) passa sem erros;
//   2. cada arquivo de violations/ gera exatamente o erro de fronteira esperado.
import { ESLint } from 'eslint';

const expected = {
  'violations/Domain/ImportsPresentation.ts': ['domain', 'presentation'],
  'violations/Domain/ImportsInfrastructureRelative.ts': ['domain', 'infrastructure'],
  'violations/Application/ImportsInfrastructure.ts': ['application', 'infrastructure'],
  'violations/Presentation/ImportsInfrastructure.ts': ['presentation', 'infrastructure'],
  'violations/Infrastructure/ImportsPresentation.ts': ['infrastructure', 'presentation'],
  'violations/Content/ImportsDomain.ts': ['content', 'domain'],
};

let failed = false;

const clean = await new ESLint().lintFiles(['src/']);
const cleanErrors = clean.reduce((n, r) => n + r.errorCount, 0);
console.log(`${cleanErrors === 0 ? '✅' : '❌'} src/ sem violações (${clean.length} arquivos, ${cleanErrors} erros)`);
if (cleanErrors > 0) failed = true;

const results = await new ESLint({ ignore: false }).lintFiles(Object.keys(expected));
for (const result of results) {
  const file = result.filePath.slice(process.cwd().length + 1);
  const [from, to] = expected[file];
  const boundaryErrors = result.messages.filter((m) => m.ruleId === 'boundaries/dependencies');
  const ok =
    result.errorCount === 1 &&
    boundaryErrors.length === 1 &&
    boundaryErrors[0].message.includes(`"${from}"`) &&
    boundaryErrors[0].message.includes(`"${to}"`);
  console.log(`${ok ? '✅' : '❌'} ${from} ➔ ${to} bloqueado (${file})`);
  if (!ok) {
    failed = true;
    for (const m of result.messages) console.log(`     ${m.ruleId}: ${m.message}`);
  }
}

process.exit(failed ? 1 : 0);
