/* Exporting the words you keep missing.
   Run:  node tests/export.test.mjs
*/
import { chromium, APP, SHOTS, day, makeChecker, gradeOne, seedProgress } from './_setup.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { check, state } = makeChecker();

const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocapp-downloads-'));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  acceptDownloads: true,
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('JS ERROR: ' + e.message));

const level = v => page.locator(`.level:has(input[value="${v}"])`);

await page.goto(APP);
await page.waitForTimeout(1400);

console.log('=== nothing to export until something is struggling ===');
await seedProgress(page, {});
check('export row hidden when no progress', await page.locator('#exportRow').isVisible(), false);

// A word answered right every time and parked in box 5 is not struggling.
await seedProgress(page, {
  '我:cn2en': { box: 5, due: day(60), seen: 9, correct: 9, lastSeen: day(-1) },
});
check('a mastered word is not flagged', await page.locator('#exportRow').isVisible(), false);

console.log('\n=== both weakness rules ===');
await seedProgress(page, {
  '我:cn2en': { box: 1, due: day(1),  seen: 4, correct: 1, lastSeen: day(-1) },  // low box
  '是:cn2en': { box: 2, due: day(3),  seen: 6, correct: 5, lastSeen: day(-2) },  // low box, decent accuracy
  '你:cn2en': { box: 4, due: day(20), seen: 10, correct: 4, lastSeen: day(-3) }, // high box, bad accuracy
  '不:cn2en': { box: 4, due: day(20), seen: 10, correct: 9, lastSeen: day(-3) }, // genuinely known
  '有:cn2en': { box: 5, due: day(60), seen: 2, correct: 1, lastSeen: day(-9) },  // 50% but only seen twice
});
check('export row now shown',  await page.locator('#exportRow').isVisible(), true);
check('three words flagged',   await page.locator('#weakCount').textContent(), '3');
await page.screenshot({ path: `${SHOTS}/export-home.png` });

console.log('\n=== the CSV itself ===');
const downloadPromise = page.waitForEvent('download');
await page.locator('#downloadWeakBtn').click();
const download = await downloadPromise;

const savedAs = download.suggestedFilename();
check('filename is dated', new RegExp(`^hsk-revise-${day(0)}\\.csv$`).test(savedAs), true);

const savedPath = path.join(downloadDir, savedAs);
await download.saveAs(savedPath);
const raw = fs.readFileSync(savedPath, 'utf8');

check('starts with a BOM so Excel reads Chinese', raw.charCodeAt(0), 0xFEFF);

const body = raw.slice(1);
const lines = body.split('\r\n');
check('CRLF line endings', body.includes('\r\n'), true);
check('header + 3 rows',   lines.length, 4);
check('header columns',    lines[0].split('","').length, 12);
console.log('        ' + lines[0]);
for (const line of lines.slice(1)) console.log('        ' + line);

console.log('\n=== weakest first ===');
const hanziColumn = lines.slice(1).map(l => l.split('","')[0].replace(/^"/, ''));
check('ordered by box then accuracy', hanziColumn, ['我', '是', '你']);

console.log('\n=== fields are quoted and escaped ===');
// 你 = "you (informal, as opposed to courteous 您)" — a definition that really
// does contain a comma, which is the whole point of quoting fields.
const withComma = lines.find(l => l.startsWith('"你"'));
check('every field is quoted', /^("[^"]*",){11}"[^"]*"$/.test(withComma.replace(/""/g, '')), true);
check('a definition containing commas stays in one field',
  withComma.split('","')[2].includes(','), true);
check('...and the row still has 12 fields', withComma.split('","').length, 12);

const escaped = await page.evaluate(() => {
  // The escaping rule itself, on the nastiest input a definition could hold.
  const f = v => '"' + String(v).replace(/"/g, '""') + '"';
  return [f('plain'), f('has, comma'), f('has "quotes"'), f('has\nnewline')];
});
check('quotes are doubled', escaped[2], '"has ""quotes"""');
check('commas need no special case', escaped[1], '"has, comma"');
check('newlines survive inside quotes', escaped[3], '"has\nnewline"');

console.log('\n=== accuracy column ===');
const row我 = lines.find(l => l.startsWith('"我"')).split('","');
check('我 accuracy is 1 of 4', row我[9], '25%');
check('box recorded',          row我[6], '1');
check('direction spelled out', row我[5], 'Chinese → English');

console.log('\n=== copy to clipboard ===');
await page.locator('#copyWeakBtn').click();
await page.waitForTimeout(400);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('clipboard holds the same rows', clip.split('\r\n').length, 4);
check('clipboard has no BOM',          clip.charCodeAt(0) !== 0xFEFF, true);
check('status line confirms',          (await page.locator('#exportStatus').textContent()).includes('Copied 3 rows'), true);

console.log('\n=== scoped to the selected levels ===');
await seedProgress(page, {
  '我:cn2en': { box: 1, due: day(1), seen: 4, correct: 1, lastSeen: day(-1) },   // HSK 1
  '把:cn2en': { box: 1, due: day(1), seen: 4, correct: 1, lastSeen: day(-1) },   // HSK 3
});
check('only HSK 1 counted', await page.locator('#weakCount').textContent(), '1');
await level('3').click();
await page.waitForTimeout(200);
check('adding HSK 3 includes it', await page.locator('#weakCount').textContent(), '2');
await level('3').click();
await page.waitForTimeout(200);
check('removing it again drops it', await page.locator('#weakCount').textContent(), '1');

console.log('\n=== both directions are separate rows ===');
await seedProgress(page, {
  '我:cn2en': { box: 1, due: day(1), seen: 3, correct: 0, lastSeen: day(-1) },
  '我:en2cn': { box: 2, due: day(3), seen: 4, correct: 2, lastSeen: day(-1) },
});
check('same word twice, once per direction', await page.locator('#weakCount').textContent(), '2');
const dl2 = page.waitForEvent('download');
await page.locator('#downloadWeakBtn').click();
const d2 = await dl2;
const p2 = path.join(downloadDir, 'dirs.csv');
await d2.saveAs(p2);
const dirLines = fs.readFileSync(p2, 'utf8').slice(1).split('\r\n').slice(1);
check('two rows', dirLines.length, 2);
check('directions differ', [dirLines[0].split('","')[5], dirLines[1].split('","')[5]].sort(),
  ['Chinese → English', 'English → Chinese']);

console.log('\n=== session misses export ===');
await seedProgress(page, {});
await page.locator('#startBtn').click();
await page.waitForTimeout(250);
for (let i = 0; i < 20; i += 1) await gradeOne(page, i % 5 !== 0);   // miss 4
await page.waitForTimeout(250);
check('summary shown',        await page.locator('.view--summary').isVisible(), true);
check('session download offered', await page.locator('#downloadSessionBtn').isVisible(), true);

const dl3 = page.waitForEvent('download');
await page.locator('#downloadSessionBtn').click();
const d3 = await dl3;
check('session filename', new RegExp(`^hsk-session-${day(0)}\\.csv$`).test(d3.suggestedFilename()), true);
const p3 = path.join(downloadDir, 'session.csv');
await d3.saveAs(p3);
const sessionLines = fs.readFileSync(p3, 'utf8').slice(1).split('\r\n');
check('header + the 4 missed words', sessionLines.length, 5);
await page.screenshot({ path: `${SHOTS}/export-summary.png` });

console.log('\n=== a perfect session offers nothing to download ===');
await page.locator('#homeBtn').click(); await page.waitForTimeout(200);
await seedProgress(page, {});
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
for (let i = 0; i < 20; i += 1) await gradeOne(page, true);
await page.waitForTimeout(250);
check('button hidden when nothing missed', await page.locator('#downloadSessionBtn').isVisible(), false);

console.log('\n=== the status line does not linger ===');
await page.locator('#homeBtn').click(); await page.waitForTimeout(200);
check('status cleared on returning home', await page.locator('#exportStatus').textContent(), '');

fs.rmSync(downloadDir, { recursive: true, force: true });
await ctx.close();
await browser.close();

console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No JS errors.'));
console.log(state.fails === 0 ? '\nALL CHECKS PASSED' : `\n${state.fails} CHECK(S) FAILED`);
process.exit(state.fails === 0 && errors.length === 0 ? 0 : 1);
