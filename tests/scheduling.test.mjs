/* Spaced repetition: what is due, in what order
   Run:  node tests/scheduling.test.mjs
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

console.log('=== a fresh user gets all new words ===');
await seedProgress(page, {});
check('0 due',              await page.locator('#statDue').textContent(), '0');
check('0 studied',          await page.locator('#statStudied').textContent(), '0');
check('button says 20 new', await page.locator('#startSub').textContent(), '20 new');
check('start enabled',      await page.locator('#startBtn').isDisabled(), false);
await page.screenshot({ path: `${SHOTS}/s6-home-new.png` });

console.log('\n=== words not yet due are SKIPPED ===');
// 我 and 是 are the two most frequent content words; park them in the future.
await seedProgress(page, {
  '我:cn2en': { box:4, due: day(10), seen:5, correct:5, lastSeen: day(-11) },
  '是:cn2en': { box:3, due: day(3),  seen:3, correct:3, lastSeen: day(-4)  },
});
check('still 0 due',        await page.locator('#statDue').textContent(), '0');
check('2 studied',          await page.locator('#statStudied').textContent(), '2');
check('all new again',      await page.locator('#startSub').textContent(), '20 new');
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
const deck1 = [];
for (let i = 0; i < 20; i++) { deck1.push(await frontWord()); await gradeOne(page, true); }
check('我 not in the session', deck1.includes('我'), false);
check('是 not in the session', deck1.includes('是'), false);
console.log('        ' + deck1.join(' '));

console.log('\n=== overdue cards come first, most overdue leading ===');
await seedProgress(page, {
  '我:cn2en':   { box:2, due: day(-9), seen:3, correct:2, lastSeen: day(-12) },
  '是:cn2en':   { box:3, due: day(-1), seen:4, correct:4, lastSeen: day(-8)  },
  '你:cn2en':   { box:1, due: day(-5), seen:2, correct:1, lastSeen: day(-6)  },
  '不:cn2en':   { box:5, due: day(30), seen:9, correct:9, lastSeen: day(-30) },
});
check('3 due',              await page.locator('#statDue').textContent(), '3');
check('button splits the deck', await page.locator('#startSub').textContent(), '3 reviews · 17 new');
await page.screenshot({ path: `${SHOTS}/s6-home-due.png` });

await page.locator('#startBtn').click(); await page.waitForTimeout(250);
const order = [];
for (let i = 0; i < 5; i++) { order.push(await frontWord()); await gradeOne(page, true); }
check('most overdue first',  order.slice(0,3), ['我','你','是']);
check('not-due card excluded', order.includes('不'), false);
console.log('        first five: ' + order.join(' '));

console.log('\n=== equally overdue: weakest box first ===');
await seedProgress(page, {
  '我:cn2en': { box:4, due: day(-2), seen:9, correct:9, lastSeen: day(-23) },
  '是:cn2en': { box:1, due: day(-2), seen:2, correct:0, lastSeen: day(-3)  },
  '你:cn2en': { box:3, due: day(-2), seen:5, correct:4, lastSeen: day(-9)  },
});
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
const boxOrder = [];
for (let i = 0; i < 3; i++) { boxOrder.push(await frontWord()); await gradeOne(page, true); }
check('box 1 before box 3 before box 4', boxOrder, ['是','你','我']);

console.log('\n=== grading updates the schedule ===');
await seedProgress(page, { '我:cn2en': { box:2, due: day(-1), seen:3, correct:3, lastSeen: day(-4) } });
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
check('review card is first', await frontWord(), '我');
await gradeOne(page, true);
let rec = await page.evaluate(() => JSON.parse(localStorage.getItem('vocapp.progress')).words['我:cn2en']);
check('box 2 -> 3',          rec.box, 3);
check('next review in 7 days', rec.due, day(7));

await seedProgress(page, { '我:cn2en': { box:4, due: day(-1), seen:9, correct:8, lastSeen: day(-22) } });
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
await gradeOne(page, false);
rec = await page.evaluate(() => JSON.parse(localStorage.getItem('vocapp.progress')).words['我:cn2en']);
check('a miss drops to box 1', rec.box, 1);
check('and comes back tomorrow', rec.due, day(1));

console.log('\n=== nothing due and nothing new: honest dead end ===');
// Mark every HSK 1 word as far in the future.
await page.evaluate(d => {
  const words = {};
  for (const w of window.HSK[1]) words[w.id + ':cn2en'] = { box:5, due:d, seen:9, correct:9, lastSeen:'2026-01-01' };
  localStorage.setItem('vocapp.progress', JSON.stringify({v:1, words}));
}, day(40));
await page.reload(); await page.waitForTimeout(1000);
check('start disabled',     await page.locator('#startBtn').isDisabled(), true);
check('explains why',       (await page.locator('#homeNote').textContent()).includes('Come back tomorrow'), true);
check('note is visible',    await page.locator('#homeNote').isVisible(), true);
check('says nothing due',   await page.locator('#startSub').textContent(), 'nothing due');
check('506 studied',        await page.locator('#statStudied').textContent(), '506');
await page.screenshot({ path: `${SHOTS}/s6-home-empty.png` });

console.log('\n=== adding a level rescues it ===');
await page.locator('.level:has(input[value="2"])').click(); await page.waitForTimeout(200);
check('start enabled again', await page.locator('#startBtn').isDisabled(), false);
check('all new from HSK 2',  await page.locator('#startSub').textContent(), '20 new');

console.log('\n=== mixed: a word is never introduced twice in one session ===');
await page.locator('.level:has(input[value="2"])').click();
await page.locator('.seg:has(input[value="mixed"])').click();
await page.waitForTimeout(150);
await seedProgress(page, {});
await page.locator('.seg:has(input[value="mixed"])').click(); await page.waitForTimeout(150);
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
const seen = [];
for (let i = 0; i < 20; i++) { seen.push(await frontWord()); await gradeOne(page, true); }
check('20 distinct words', new Set(seen).size, 20);

console.log('\n=== mixed: due in one direction only ===');
await seedProgress(page, {
  '我:cn2en': { box:5, due: day(60), seen:9, correct:9, lastSeen: day(-1) },   // known one way
  '我:en2cn': { box:1, due: day(-3), seen:2, correct:0, lastSeen: day(-4) },   // rusty the other
});
const dueNow = await page.locator('#statDue').textContent();
check('exactly one direction is due', dueNow, '1');
await page.locator('#startBtn').click(); await page.waitForTimeout(250);
check('first card is the rusty direction', await page.locator('#frontPrompt').isVisible(), true);
check('...and it is 我', await page.locator('#backHanzi').textContent(), '我');

check('no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
await ctx.close(); await browser.close();
console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No JS errors.'));
console.log(state.fails === 0 ? '\nALL CHECKS PASSED' : `\n${state.fails} CHECK(S) FAILED`);
process.exit(state.fails === 0 && errors.length === 0 ? 0 : 1);
