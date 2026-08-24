/* Saved settings and progress, and surviving a word-list update
   Run:  node tests/storage.test.mjs
*/
import { chromium, APP, SHOTS, ROOT, day, makeChecker, gradeOne, finishSession, seedProgress } from './_setup.mjs';
const { check, state } = makeChecker();

import fs from 'node:fs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('JS ERROR: ' + e.message));

// A person clicks the label, not the visually hidden input inside it.
const level = v => page.locator(`.level:has(input[value="${v}"])`);
const dir   = v => page.locator(`.seg:has(input[value="${v}"])`);
const isChecked = v => page.locator(`input[value="${v}"]`).isChecked();

// Whichever side is showing, tell me which word it is.
const frontWord = async () => (await page.locator('#frontHanzi').isVisible())
  ? await page.locator('#frontHanzi').textContent()
  : await page.locator('#backHanzi').textContent();

const L1 = ROOT + '/data/hsk3-L1.js';

await page.goto(APP);
await page.waitForTimeout(1400);

console.log('=== localStorage actually works over file:// ===');
const storageWorks = await page.evaluate(() => {
  try { localStorage.setItem('__t','1'); const v = localStorage.getItem('__t'); localStorage.removeItem('__t'); return v === '1'; }
  catch { return false; }
});
check('storage usable on file://', storageWorks, true);

console.log('\n=== study 5 cards, get 3 right ===');
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
const studied = [];
for (let i = 0; i < 5; i++) {
  studied.push(await page.locator('#frontHanzi').textContent());
  await gradeOne(page, i < 3);
}
console.log('        graded: ' + studied.join(' ') + '  (first 3 correct, last 2 missed)');

const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('vocapp.progress')));
check('progress has a version', stored.v, 1);
check('5 records written', Object.keys(stored.words).length, 5);
const firstKey = studied[0] + ':cn2en';
check('key is word id + direction', Object.keys(stored.words).includes(firstKey), true);
console.log('        ' + firstKey + ' -> ' + JSON.stringify(stored.words[firstKey]));

console.log('\n=== Leitner bookkeeping ===');
const right = stored.words[studied[0] + ':cn2en'];
const wrong = stored.words[studied[4] + ':cn2en'];
check('correct answer -> box 2', right.box, 2);
check('wrong answer -> box 1',   wrong.box, 1);
check('correct counted',         right.correct, 1);
check('miss not counted correct', wrong.correct, 0);
check('both seen once',          [right.seen, wrong.seen], [1,1]);

console.log('\n=== due dates are LOCAL dates, not UTC ===');
const dates = await page.evaluate(() => {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return { local: d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()), utc: d.toISOString().slice(0,10) };
});
check('lastSeen is local today', right.lastSeen, dates.local);
const expectDue = (iso, days) => { const p = iso.split('-').map(Number); const d = new Date(p[0],p[1]-1,p[2]); d.setDate(d.getDate()+days); const pad=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
check('box 2 due in 3 days', right.due, expectDue(dates.local, 3));
check('box 1 due in 1 day',  wrong.due, expectDue(dates.local, 1));
console.log(`        (local ${dates.local} / UTC ${dates.utc}${dates.local !== dates.utc ? '  <- they differ right now!' : ''})`);

console.log('\n=== change settings, then reload the page ===');
await page.locator('#homeBtn').click({timeout:2000}).catch(async () => {
  for (let i=0;i<20;i++){ if (await page.locator('.view--summary').isVisible()) break; await gradeOne(page, true); }
  await page.locator('#homeBtn').click();
});
await page.waitForTimeout(200);
await level('3').click(); await dir('en2cn').click(); await page.waitForTimeout(150);
const studiedBefore = await page.locator('#statStudied').textContent();

await page.reload(); await page.waitForTimeout(1200);
check('back on home after reload', await page.locator('.view--home').isVisible(), true);
check('HSK 1 still selected',      await page.locator('input[value="1"]').isChecked(), true);
check('HSK 3 still selected',      await page.locator('input[value="3"]').isChecked(), true);
check('HSK 2 still unselected',    await page.locator('input[value="2"]').isChecked(), false);
check('direction still EN -> 中',  await page.locator('input[value="en2cn"]').isChecked(), true);
check('studied count survived',    await page.locator('#statStudied').textContent(), studiedBefore);
console.log('        studied count reads ' + studiedBefore);
await page.screenshot({ path: `${SHOTS}/s5-home-after-reload.png` });

console.log('\n=== THE ONE THAT MATTERS: ship a new word list, keep the progress ===');
// Snapshot the progress as it stands RIGHT NOW, immediately before the swap.
// Comparing against an older snapshot would be comparing two different things.
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('vocapp.progress')));
console.log(`        ${Object.keys(before.words).length} records on disk before the swap`);

const original = fs.readFileSync(L1, 'utf8');
try {
  // Simulate an upstream data update: fix a translation AND insert a new word
  // at the very front, which is exactly what would have broken positional ids.
  let updated = original.replace('"english":"I; me; my"', '"english":"I; me (corrected)"');
  updated = updated.replace('window.HSK[1] = [', 'window.HSK[1] = [{"id":"新词","hanzi":"新词","pinyin":"xīncí","english":"a newly added word","pos":"noun","freq":0,"level":1},');
  check('test fixture actually changed the file', updated !== original, true);
  fs.writeFileSync(L1, updated);

  await page.reload(); await page.waitForTimeout(1200);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('vocapp.progress')));
  check('same number of records', Object.keys(after.words).length, Object.keys(before.words).length);
  check('same keys, unchanged',   Object.keys(after.words).sort(), Object.keys(before.words).sort());
  check('every record identical', after.words, before.words);
  check('studied count unchanged',  await page.locator('#statStudied').textContent(), studiedBefore);
  check('new word list did load',   await page.evaluate(() => window.HSK[1][0].hanzi), '新词');
  console.log('        word list changed underneath it; not one record touched.');
} finally {
  fs.writeFileSync(L1, original);
}
await page.reload(); await page.waitForTimeout(1000);
check('data file restored', await page.evaluate(() => window.HSK[1].length), 506);

console.log('\n=== the app survives storage being unavailable ===');
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx2.addInitScript(() => {
  Object.defineProperty(window, 'localStorage', {
    get() { throw new DOMException('storage disabled', 'SecurityError'); }
  });
});
const page2 = await ctx2.newPage();
const errors2 = [];
page2.on('pageerror', e => errors2.push(e.message));
await page2.goto(APP); await page2.waitForTimeout(1200);
check('home screen still renders', await page2.locator('.view--home').isVisible(), true);
check('start button still works',  await page2.locator('#startBtn').isEnabled(), true);
await page2.locator('#startBtn').click(); await page2.waitForTimeout(250);
check('can still study',           await page2.locator('.view--study').isVisible(), true);
await page2.locator('#card').click(); await page2.waitForTimeout(100);
await page2.locator('#gotBtn').click(); await page2.waitForTimeout(150);
check('grading does not crash',    errors2.length, 0);
await ctx2.close();

await ctx.close(); await browser.close();
console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No JS errors.'));
console.log(state.fails === 0 ? '\nALL CHECKS PASSED' : `\n${state.fails} CHECK(S) FAILED`);
process.exit(state.fails === 0 && errors.length === 0 ? 0 : 1);
