#!/usr/bin/env node
// Measures line coverage per COVERAGE.json area from Node's built-in coverage (lcov reporter).
// Usage (from repo root): node scripts/coverage-areas.mjs   -> prints JSON; add --write to update COVERAGE.json.
// Figures are lines hit / lines found over the area's backend source files that the unit tests load.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const AREAS = {
  fixtures: ['backend/src/domain/fixtures/'],
  scoring: ['backend/src/domain/scoring/', 'backend/src/domain/sports/', 'backend/src/lib/signature.js', 'backend/src/lib/canonical.js'],
  standings: ['backend/src/domain/standings/'],
  store: ['backend/src/domain/store/'],
  roster: ['backend/src/domain/roster/'],
  rbac: ['backend/src/domain/rbac/', 'backend/src/middleware/rateLimit.js'],
};

const tests = readdirSync('tests').filter((f) => f.endsWith('.test.js')).map((f) => join('tests', f));
const out = join(mkdtempSync(join(tmpdir(), 'cov-')), 'lcov.info');
execFileSync(process.execPath, ['--test', '--experimental-test-coverage', '--test-reporter=lcov',
  `--test-reporter-destination=${out}`, ...tests], { stdio: 'ignore' });

const files = [];
let cur = null;
for (const line of readFileSync(out, 'utf8').split('\n')) {
  if (line.startsWith('SF:')) cur = { file: line.slice(3).replace(process.cwd() + '/', ''), lf: 0, lh: 0 };
  else if (line.startsWith('LF:')) cur.lf = Number(line.slice(3));
  else if (line.startsWith('LH:')) cur.lh = Number(line.slice(3));
  else if (line === 'end_of_record' && cur) { files.push(cur); cur = null; }
}

const result = {};
for (const [area, prefixes] of Object.entries(AREAS)) {
  const fs = files.filter((f) => prefixes.some((p) => f.file.startsWith(p)));
  const lf = fs.reduce((s, f) => s + f.lf, 0);
  const lh = fs.reduce((s, f) => s + f.lh, 0);
  result[area] = lf ? Math.floor((lh / lf) * 1000) / 10 : 0;
  console.error(`${area}: ${lh}/${lf} lines  (${fs.map((f) => f.file.split('/').slice(-2).join('/')).join(', ')})`);
}
console.log(JSON.stringify(result));
if (process.argv.includes('--write')) writeFileSync('COVERAGE.json', JSON.stringify(result, null, 2) + '\n');
