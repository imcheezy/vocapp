/* Run every browser test.

   Usage:  node tests/run.mjs

   Each test file is a standalone script that exits non-zero on failure, so
   they can also be run one at a time while working on a single area:

       node tests/scheduling.test.mjs
*/
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort();

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
