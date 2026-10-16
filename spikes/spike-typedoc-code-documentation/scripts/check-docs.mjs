// Prova que a documentação funciona nos dois sentidos:
//   1. src/ (todo export documentado) gerou o Markdown de cada entidade, value object e porta,
//      com o conteúdo do TSDoc (exemplo, exceções, parâmetros e retornos);
//   2. cada arquivo de violations/ faz o TypeDoc falhar com exatamente o aviso esperado.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const OUT = 'docs/code';
let failed = false;
const report = (ok, msg) => {
  console.log(`${ok ? '✅' : '❌'} ${msg}`);
  if (!ok) failed = true;
};

// --- 1. src/: Markdown gerado com o conteúdo do TSDoc ---
const pages = {
  'Domain/ValueObjects/Level/interfaces/Level.md': ['XP mínimo, inclusivo'],
  'Domain/ValueObjects/LevelLadder/classes/LevelLadder.md': ['## Example', '### Throws', 'InvalidLadderError', 'levelsCrossed'],
  'Domain/ValueObjects/LevelLadder/classes/InvalidLadderError.md': ['Motivo legível da rejeição'],
  'Domain/Entities/LearnerProgress/classes/LearnerProgress.md': ['## Remarks', 'completeMission', 'idempotente', '### Throws'],
  'Domain/Entities/LearnerProgress/interfaces/ProgressSnapshot.md': ['completedMissions'],
  'Application/Ports/ProgressRepository/interfaces/ProgressRepository.md': ['#### Returns', '`null` se o aluno ainda não começou', 'toSnapshot'],
};

for (const [page, mustContain] of Object.entries(pages)) {
  const file = `${OUT}/${page}`;
  if (!existsSync(file)) {
    report(false, `${page} não foi gerado`);
    continue;
  }
  const md = readFileSync(file, 'utf8');
  const missing = mustContain.filter((s) => !md.includes(s));
  report(missing.length === 0, `${page}${missing.length ? ` (faltando: ${missing.join(', ')})` : ''}`);
}

// --- 2. violations/: cada caso barrado com o aviso esperado ---
const violations = {
  'violations/UndocumentedExport.ts': ['export sem TSDoc', 'xpForMission (CallSignature)', 'does not have any documentation'],
  'violations/UndocumentedMethod.ts': ['método público sem TSDoc', 'MissionCatalog.count (CallSignature)', 'does not have any documentation'],
  'violations/BrokenLink.ts': ['{@link} para símbolo inexistente', 'Failed to resolve link to "EscadaDeNiveis"'],
};

for (const [file, [label, ...expected]] of Object.entries(violations)) {
  const run = spawnSync(
    'node_modules/.bin/typedoc',
    ['--entryPoints', file, '--entryPointStrategy', 'resolve', '--emit', 'none', '--logLevel', 'Warn'],
    { encoding: 'utf8' },
  );
  const output = (run.stdout + run.stderr).replace(/\x1b\[[0-9;]*m/g, '');
  const warnings = output.split('\n').filter((l) => l.startsWith('[warning]') && !l.includes('Found 0 errors'));
  const ok = run.status !== 0 && warnings.length === 1 && expected.every((s) => warnings[0].includes(s));
  report(ok, `${label} barrado (${file})`);
  if (!ok) console.log(output.replace(/^/gm, '     '));
}

// --- Trecho do Markdown gerado, para a página do portfólio ---
const sample = `${OUT}/Domain/ValueObjects/LevelLadder/classes/LevelLadder.md`;
if (existsSync(sample)) {
  const md = readFileSync(sample, 'utf8');
  const start = md.indexOf('### create()');
  const end = md.indexOf('***', start);
  if (start >= 0) {
    console.log(`\n--- trecho gerado: ${sample} ---\n`);
    console.log(md.slice(start, end > start ? end : undefined).trim());
  }
}

process.exit(failed ? 1 : 0);
