// Os casos de cases/ nas regras em TypeScript (o PHP roda os mesmos em scripts/verify.php).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { badgeProblems, courseCompleted, earnedBadges, type Badge, type Progress } from './badges.ts';

const dir = new URL('../cases/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const c = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  test(`${file}: ${c.description}`, () => {
    if ('problems' in c.expect) assert.deepEqual(badgeProblems(c.badges, c.phases, c.attributes), c.expect.problems);
    if ('earned' in c.expect) assert.deepEqual(earnedBadges(c.badges as Badge[], c.phases, c.progress as Progress), c.expect.earned);
    if ('completed' in c.expect) assert.equal(courseCompleted(c.phases, c.progress as Progress), c.expect.completed);
  });
}
