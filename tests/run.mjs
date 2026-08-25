/* Run every browser test.

   Usage:  node tests/run.mjs

   Each test file is a standalone script that exits non-zero on failure, so
   they can also be run one at a time while working on a single area:

       node tests/scheduling.test.mjs
*/
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort();

/* Guard against a bug that is invisible on the machine that has it.

   home.test.mjs once contained the literal path file:///home/user/vocapp/,
   which is where the repository sat on the machine that wrote it. Every local
   run passed. It failed the moment it ran anywhere else — and only CI could
   ever have caught it, because only CI has a different path.

   A test that only works in one checkout is not a test. This refuses to run
   the suite at all if one creeps back in: use APP and ROOT from _setup.mjs. */
// Matches either a file:// URL or a quoted string that starts at a root
// directory. Note file:/// already carries its three slashes — asking for a
// fourth was the bug in the first version of this guard, which let exactly
// the thing it was written to catch walk straight past it.
const ABSOLUTE_PATH = /(file:\/\/\/|['"`]\/)(home|Users|var|tmp|opt)\//;

const offenders = files
  .map(file => ({ file, source: readFileSync(path.join(here, file), 'utf8') }))
  .filter(({ source }) => ABSOLUTE_PATH.test(source));

if (offenders.length > 0) {
  console.error('\nHardcoded absolute paths found — these only work on one machine:\n');
  for (const { file, source } of offenders) {
    const line = source.split('\n').findIndex(l => ABSOLUTE_PATH.test(l)) + 1;
    console.error(`  ${file}:${line}`);
  }
  console.error('\nUse APP or ROOT from ./_setup.mjs instead.\n');
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  console.log('\n' + '='.repeat(64));
  console.log('  ' + file);
  console.log('='.repeat(64));

  const result = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}

console.log('\n' + '='.repeat(64));
if (failed === 0) {
  console.log(`  ${files.length} test file${files.length === 1 ? '' : 's'} passed`);
} else {
  console.log(`  ${failed} of ${files.length} test files FAILED`);
}
console.log('='.repeat(64));

process.exit(failed === 0 ? 0 : 1);
