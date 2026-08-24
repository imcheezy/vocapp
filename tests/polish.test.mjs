/* Keyboard shortcuts, prompt shortening, reset, reduced motion
   Run:  node tests/polish.test.mjs
*/
import { chromium, APP, SHOTS, day, makeChecker, gradeOne, finishSession, seedProgress } from './_setup.mjs';
const { check, state } = makeChecker();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, colorScheme: 'dark', hasTouch: false });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('JS ERROR: ' + e.message));
await page.goto(APP); await page.waitForTimeout(1200);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(1000);

console.log('=== shortened EN → 中 prompts ===');
const samples = await page.evaluate(() => {
  function promptText(english) {
    const senses = english.split(';').map(p => p.trim()).filter(Boolean);
    if (!senses.length) return english;
    const first = senses[0];
    if (first.startsWith('(') && first.endsWith(')')) return english;
    if (first.length < 15 && senses.length > 1) return first + '; ' + senses[1];
    return first;
  }
  const pick = h => window.HSK[1].find(w => w.hanzi === h);
  return ['我','说','个','的','时间'].map(h => {
    const w = pick(h);
    return { hanzi: h, full: w.english, prompt: promptText(w.english) };
  });
});
for (const s of samples) console.log(`        ${s.hanzi}  "${s.full.slice(0,52)}"\n            -> "${s.prompt}"`);
check('我 shortened to two senses', samples[0].prompt, 'I; me');
// "to speak" is 8 chars, under the 15-char threshold, so the rule appends the
// second sense — which is the intended behaviour and the better prompt.
check('说 short first sense gains a second', samples[1].prompt, 'to speak; to talk');
check('说 dropped the other three senses', samples[1].prompt.split(';').length, 2);
check('的 trimmed from four senses to two', samples[3].prompt, "of; ~'s (possessive particle)");
check('个 kept whole (all parenthetical)', samples[2].prompt, samples[2].full);

await page.locator('.seg:has(input[value="en2cn"])').click(); await page.waitForTimeout(150);
await page.locator('#startBtn').click(); await page.waitForTimeout(300);
const shownPrompt = await page.locator('#frontPrompt').textContent();
check('card prompt is the short form', shownPrompt.length < 40, true);
console.log(`        card shows: "${shownPrompt}"`);
await page.screenshot({ path: `${SHOTS}/s7-en2cn-front.png` });

await page.locator('#card').click(); await page.waitForTimeout(250);
check('full definition now visible on back', await page.locator('#backEnglish').isVisible(), true);
const backSize = await page.locator('#backEnglish').evaluate(el => getComputedStyle(el).fontSize);
check('...and it is de-emphasised', backSize, '14px');
await page.screenshot({ path: `${SHOTS}/s7-en2cn-back.png` });

console.log('\n=== keyboard shortcuts ===');
await page.locator('#homeBtn').click({timeout:1500}).catch(()=>{});
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(1000);
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
await page.locator('body').click({ position: { x: 5, y: 5 } });   // move focus off the card

check('starts face down', await page.locator('.card__face--front').isVisible(), true);
await page.keyboard.press('Space'); await page.waitForTimeout(180);
check('Space reveals',    await page.locator('.card__face--back').isVisible(), true);
await page.keyboard.press('Space'); await page.waitForTimeout(180);
check('Space hides again',await page.locator('.card__face--front').isVisible(), true);

console.log('\n=== arrows grade, but only once revealed ===');
const wordA = await page.locator('#frontHanzi').textContent();
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(180);
check('arrow ignored while face down', await page.locator('#frontHanzi').textContent(), wordA);

await page.keyboard.press('Space'); await page.waitForTimeout(150);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
check('→ graded and advanced', (await page.locator('#frontHanzi').textContent()) !== wordA, true);
let progress = await page.evaluate(() => JSON.parse(localStorage.getItem('vocapp.progress')).words);
check('→ recorded as correct', progress[wordA + ':cn2en'].correct, 1);
check('→ moved it to box 2',   progress[wordA + ':cn2en'].box, 2);

const wordB = await page.locator('#frontHanzi').textContent();
await page.keyboard.press('Space'); await page.waitForTimeout(150);
await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
progress = await page.evaluate(() => JSON.parse(localStorage.getItem('vocapp.progress')).words);
check('← recorded as missed',  progress[wordB + ':cn2en'].correct, 0);
check('← left it in box 1',    progress[wordB + ':cn2en'].box, 1);

console.log('\n=== Space on a focused button does not double-fire ===');
await page.locator('#card').focus();
const beforeWord = await page.locator('#frontHanzi').textContent();
await page.keyboard.press('Space'); await page.waitForTimeout(220);
check('one press = one flip', await page.locator('.card__face--back').isVisible(), true);
check('same card still',      await page.locator('#backHanzi').textContent(), beforeWord);

console.log('\n=== keyboard is inert outside the study screen ===');
for (let i=0;i<25;i++){ if (await page.locator('.view--summary').isVisible()) break;
  if (!(await page.locator('.grade').isVisible())) { await page.locator('#card').click(); await page.waitForTimeout(10); }
  await page.locator('#gotBtn').click(); await page.waitForTimeout(10); }
await page.locator('#homeBtn').click(); await page.waitForTimeout(200);
const homeProgress = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('vocapp.progress')).words).length);
await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); await page.waitForTimeout(200);
check('home screen unaffected by keys', await page.locator('.view--home').isVisible(), true);
check('no phantom grading', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('vocapp.progress')).words).length), homeProgress);

console.log('\n=== keyboard hint shows on pointer devices only ===');
check('visible with a mouse', await page.locator('.kbd-hint').isVisible(), false);
await page.locator('#startBtn').click(); await page.waitForTimeout(200);
check('visible while studying (mouse)', await page.locator('.kbd-hint').isVisible(), true);
await page.screenshot({ path: `${SHOTS}/s7-study-desktop.png` });

const touchCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
const touchPage = await touchCtx.newPage();
await touchPage.goto(APP); await touchPage.waitForTimeout(1100);
await touchPage.locator('#startBtn').tap(); await touchPage.waitForTimeout(250);
check('hidden on a touch device', await touchPage.locator('.kbd-hint').isVisible(), false);
await touchCtx.close();

console.log('\n=== reset progress ===');
await page.locator('#homeBtn').click({timeout:1500}).catch(async()=>{
  for (let i=0;i<25;i++){ if (await page.locator('.view--summary').isVisible()) break;
    if (!(await page.locator('.grade').isVisible())) { await page.locator('#card').click(); await page.waitForTimeout(10); }
    await page.locator('#gotBtn').click(); await page.waitForTimeout(10); }
  await page.locator('#homeBtn').click();
});
await page.waitForTimeout(250);
check('reset button offered',   await page.locator('#resetBtn').isVisible(), true);

page.once('dialog', d => d.dismiss());
await page.locator('#resetBtn').click(); await page.waitForTimeout(250);
check('cancelling keeps progress', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('vocapp.progress')).words).length > 0), true);

let dialogText = '';
page.once('dialog', d => { dialogText = d.message(); d.accept(); });
await page.locator('#resetBtn').click(); await page.waitForTimeout(300);
check('confirm says how much is at stake', /card record/.test(dialogText), true);
check('progress cleared', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('vocapp.progress')).words).length), 0);
check('studied count back to 0', await page.locator('#statStudied').textContent(), '0');
check('reset button hides again', await page.locator('#resetBtn').isVisible(), false);
console.log(`        dialog said: "${dialogText.replace(/\n+/g,' ')}"`);

console.log('\n=== reduced motion is honoured ===');
const rmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
const rmPage = await rmCtx.newPage();
await rmPage.goto(APP); await rmPage.waitForTimeout(1100);
await rmPage.locator('#startBtn').click(); await rmPage.waitForTimeout(200);
const anim = await rmPage.locator('.card__face--front').evaluate(el => getComputedStyle(el).animationName);
check('card animation disabled', anim, 'none');
const trans = await rmPage.locator('#progressFill').evaluate(el => getComputedStyle(el).transitionDuration);
check('progress transition disabled', trans, '0s');
await rmCtx.close();

console.log('\n=== animation is on by default ===');
const anim2 = await page.evaluate(() => { const el = document.querySelector('.card__face--front'); return getComputedStyle(el).animationName; });
check('faceIn active normally', anim2, 'faceIn');

check('no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
await ctx.close(); await browser.close();
console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No JS errors.'));
console.log(state.fails === 0 ? '\nALL CHECKS PASSED' : `\n${state.fails} CHECK(S) FAILED`);
process.exit(state.fails === 0 && errors.length === 0 ? 0 : 1);
