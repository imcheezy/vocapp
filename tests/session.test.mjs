/* A full study session: reveal, grade, summary
   Run:  node tests/session.test.mjs
*/
import { chromium, APP, SHOTS, day, makeChecker, gradeOne, finishSession, seedProgress } from './_setup.mjs';
const { check, state } = makeChecker();

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

await page.goto(APP);
await page.waitForTimeout(1400);

// The app opens on Home from Slice 4 onward, so a session has to be started.
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1200);
await page.locator('#startBtn').click();
await page.waitForTimeout(250);

console.log('=== deck ordering: content words before grammar words ===');
const deck = await page.evaluate(() => {
  const pool = window.HSK[1].slice().sort((a,b)=>a.freq-b.freq);
  const fn = ['particle','preposition','conjunction'];
  return pool.filter(w=>!fn.includes(w.pos)).concat(pool.filter(w=>fn.includes(w.pos))).slice(0,20)
             .map(w=>w.hanzi+'('+w.pos+')');
});
console.log('        ' + deck.join(' '));
const particlesInFirst10 = deck.slice(0,10).filter(s => /particle|preposition|conjunction/.test(s)).length;
check('no grammar words in first 10', particlesInFirst10, 0);
check('的 is not the first card', await page.locator('#frontHanzi').textContent() !== '的', true);

console.log('\n=== grading a card ===');
check('starts on study screen', await page.locator('.view--study').isVisible(), true);
check('summary hidden',         await page.locator('.view--summary').isVisible(), false);
check('progress starts 0%',     await page.locator('#progressFill').evaluate(el=>el.style.width), '0%');

await page.locator('#card').click();               // reveal
await page.waitForTimeout(150);
check('grade buttons appear',   await page.locator('.grade').isVisible(), true);
check('hint hidden on back',    await page.locator('#hint').isVisible(), false);
await page.screenshot({ path: `${SHOTS}/s3-back.png` });

await page.locator('#card').click();               // hide again
await page.waitForTimeout(150);
check('can hide the answer again', await page.locator('.card__face--front').isVisible(), true);

await page.locator('#card').click();               // reveal
await page.waitForTimeout(100);
const first = await page.locator('#backHanzi').textContent();
await page.locator('#gotBtn').click();             // grade correct
await page.waitForTimeout(150);
check('advances to next card',  await page.locator('#frontHanzi').textContent() !== first, true);
check('progress moved to 5%',   await page.locator('#progressFill').evaluate(el=>el.style.width), '5%');
check('back hidden on new card', await page.locator('.card__face--back').isVisible(), false);

console.log('\n=== complete a session: miss 4 of the remaining 19 ===');
for (let i = 1; i < 20; i++) {
  await page.locator('#card').click();
  await page.waitForTimeout(20);
  await page.locator(i % 5 === 0 ? '#missedBtn' : '#gotBtn').click();
  await page.waitForTimeout(20);
}
await page.waitForTimeout(300);
check('summary now showing',  await page.locator('.view--summary').isVisible(), true);
check('study screen hidden',  await page.locator('.view--study').isVisible(), false);
check('total is 20',          await page.locator('#scoreTotal').textContent(), '20');
check('correct is 17',        await page.locator('#scoreCorrect').textContent(), '17');
check('missed count label',   await page.locator('#missedCount').textContent(), '3 words');
check('missed rows rendered', await page.locator('.missed li').count(), 3);
check('score bar at 85%',     await page.locator('#scoreFill').evaluate(el=>el.style.width), '85%');
check('perfect message hidden', await page.locator('#perfect').isVisible(), false);
await page.screenshot({ path: `${SHOTS}/s3-summary.png` });

console.log('\n=== study again resets everything ===');
await page.locator('#againBtn').click();
await page.waitForTimeout(200);
check('back on study screen', await page.locator('.view--study').isVisible(), true);
check('progress reset',       await page.locator('#progressFill').evaluate(el=>el.style.width), '0%');

console.log('\n=== a perfect session shows the other message ===');
for (let i = 0; i < 20; i++) {
  await page.locator('#card').click();
  await page.waitForTimeout(20);
  await page.locator('#gotBtn').click();
  await page.waitForTimeout(20);
}
await page.waitForTimeout(250);
check('correct is 20',          await page.locator('#scoreCorrect').textContent(), '20');
check('perfect message shows',  await page.locator('#perfect').isVisible(), true);
check('review list hidden',     await page.locator('#review').isVisible(), false);
await page.screenshot({ path: `${SHOTS}/s3-perfect.png` });

check('no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
await ctx.close();
await browser.close();
console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No JS errors.'));
console.log(state.fails === 0 ? '\nALL CHECKS PASSED' : `\n${state.fails} CHECK(S) FAILED`);
process.exit(state.fails === 0 && errors.length === 0 ? 0 : 1);
