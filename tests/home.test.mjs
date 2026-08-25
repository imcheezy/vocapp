/* Home screen: level selection and study direction
   Run:  node tests/home.test.mjs
*/
import { chromium, APP, SHOTS, day, makeChecker, gradeOne, finishSession, seedProgress } from './_setup.mjs';
const { check, state } = makeChecker();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('JS ERROR: ' + e.message));
await page.goto(APP);
await page.waitForTimeout(1500);
const level = v => page.locator(`.level:has(input[value="${v}"])`);
const dir   = v => page.locator(`.seg:has(input[value="${v}"])`);
const isChecked = v => page.locator(`input[value="${v}"]`).isChecked();
    await page.waitForTimeout(15);
  await page.waitForTimeout(15);

console.log('=== home screen ===');
check('opens on home',        await page.locator('.view--home').isVisible(), true);
check('study hidden',         await page.locator('.view--study').isVisible(), false);
check('HSK 1 preselected',    await isChecked('1'), true);
check('word count shown',     await page.locator('#statWords').textContent(), '506');
await page.screenshot({ path: `${SHOTS}/s4-home.png` });

console.log('\n=== clicking a level label toggles its checkbox ===');
await level('2').click(); await page.waitForTimeout(120);
check('HSK 2 now checked',    await isChecked('2'), true);
check('L1+L2 = 1,256',        await page.locator('#statWords').textContent(), '1,256');
await level('3').click(); await level('4').click(); await page.waitForTimeout(120);
check('all four = 3,181',     await page.locator('#statWords').textContent(), '3,181');
await page.screenshot({ path: `${SHOTS}/s4-home-all.png` });

console.log('\n=== unchecking everything guards Start ===');
for (const v of ['1','2','3','4']) { await level(v).click(); await page.waitForTimeout(60); }
check('start disabled',       await page.locator('#startBtn').isDisabled(), true);
check('warning shown',        await page.locator('#homeNote').isVisible(), true);
check('warning names the fix', (await page.locator('#homeNote').textContent()).includes('at least one level'), true);
check('count is 0',           await page.locator('#statWords').textContent(), '0');
await level('1').click(); await page.waitForTimeout(120);
check('start re-enabled',     await page.locator('#startBtn').isDisabled(), false);
check('warning gone',         await page.locator('#homeNote').isVisible(), false);

console.log('\n=== 中 → EN (default) ===');
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
check('now studying',         await page.locator('.view--study').isVisible(), true);
check('character on front',   await page.locator('#frontHanzi').isVisible(), true);
check('english prompt hidden',await page.locator('#frontPrompt').isVisible(), false);
await page.locator('#card').click(); await page.waitForTimeout(150);
check('back shows english',   await page.locator('#backEnglish').isVisible(), true);
check('back character small', await page.locator('#backHanzi').evaluate(el=>getComputedStyle(el).fontSize), '56px');
await page.screenshot({ path: `${SHOTS}/s4-cn2en.png` });

console.log('\n=== EN → 中 ===');
await finishSession(page);
await page.locator('#homeBtn').click(); await page.waitForTimeout(200);
check('Home button returns home', await page.locator('.view--home').isVisible(), true);
check('level choice survived',    await isChecked('1'), true);

await dir('en2cn').click(); await page.waitForTimeout(120);
check('direction switched',   await isChecked('en2cn'), true);
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
check('english prompt shown', await page.locator('#frontPrompt').isVisible(), true);
check('character hidden on front', await page.locator('#frontHanzi').isVisible(), false);
check('prompt is english', /[a-z]/.test(await page.locator('#frontPrompt').textContent()), true);
await page.screenshot({ path: `${SHOTS}/s4-en2cn-front.png` });

await page.locator('#card').click(); await page.waitForTimeout(200);
check('answer character is large', await page.locator('#backHanzi').evaluate(el=>getComputedStyle(el).fontSize), '96px');
check('full definition shown on back (Slice 7 changed this)', await page.locator('#backEnglish').isVisible(), true);
check('pinyin still shown',   await page.locator('#backPinyin').isVisible(), true);
await page.screenshot({ path: `${SHOTS}/s4-en2cn-back.png` });

console.log('\n=== mixed assigns per card, and stays put ===');
await finishSession(page);
await page.locator('#homeBtn').click(); await page.waitForTimeout(150);
await dir('mixed').click(); await page.waitForTimeout(120);
await page.locator('#startBtn').click(); await page.waitForTimeout(200);
// walk 20 cards and record which prompt each showed
const promptKinds = [];
for (let i = 0; i < 20; i++) {
  promptKinds.push(await page.locator('#frontHanzi').isVisible() ? 'cn2en' : 'en2cn');
  await gradeOne(page, true);
}
const kinds = Array.from(new Set(promptKinds)).sort();
check('mixed deck contains both directions', kinds, ['cn2en','en2cn']);
console.log('        ' + promptKinds.join(' '));

console.log('\n=== a card does not change direction when redrawn ===');
await page.locator('#homeBtn').click(); await page.waitForTimeout(150);
await page.locator('#startBtn').click(); await page.waitForTimeout(200);
const before = await page.locator('#frontHanzi').isVisible();
await page.locator('#card').click(); await page.waitForTimeout(80);   // reveal (redraw)
await page.locator('#card').click(); await page.waitForTimeout(80);   // hide   (redraw)
check('same prompt after two redraws', await page.locator('#frontHanzi').isVisible(), before);

console.log('\n=== hidden inputs remain real controls ===');
await page.locator('#homeBtn').click({timeout:2000}).catch(async()=>{ await finishSession(page); await page.locator('#homeBtn').click(); });
await page.waitForTimeout(200);
const inputState = await page.evaluate(() => {
  const i = document.querySelector('.view--home input');
  const cs = getComputedStyle(i);
  return { display: cs.display, visibility: cs.visibility, disabled: i.disabled };
});
check('not display:none',     inputState.display !== 'none', true);
check('not visibility:hidden', inputState.visibility !== 'hidden', true);
check('not disabled',         inputState.disabled, false);

check('no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
await ctx.close(); await browser.close();
console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No JS errors.'));
console.log(state.fails === 0 ? '\nALL CHECKS PASSED' : `\n${state.fails} CHECK(S) FAILED`);
process.exit(state.fails === 0 && errors.length === 0 ? 0 : 1);
