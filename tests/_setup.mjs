/* Shared setup for the browser tests.

   Playwright is a DEVELOPMENT dependency only. The app itself still has none
   — index.html opens in a browser with nothing installed. These tests just
   drive a real browser to check it behaves.

   Install once with:  npm install -D playwright
   (or use a global install; both are found below.)
*/
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (localMiss) {
    try {
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      return require(path.join(globalRoot, 'playwright', 'index.js'));
    } catch (globalMiss) {
      console.error('\nPlaywright is not installed.\n');
      console.error('  npm install -D playwright\n');
      process.exit(2);
    }
  }
}

export const { chromium } = loadPlaywright();

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

/* The app is tested over file://, because that is how it is actually opened.
   Testing it over http:// would quietly miss the whole class of problems that
   made the word lists .js files instead of .json. */
export const APP = 'file://' + path.join(ROOT, 'index.html');

export const SHOTS = path.join(here, 'screenshots');

/* A calendar date N days from today, in local time — matching how the app
   itself builds dates. Never toISOString(), which is UTC. */
export function day(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = n => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/* Tiny assertion helper. Deliberately not a test framework — one file, no
   config, no plugins, nothing to keep up to date. */
export function makeChecker() {
  const state = { fails: 0 };

  function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) state.fails += 1;
    const detail = ok ? '' : `  (expected ${JSON.stringify(expected)})`;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${detail}`);
  }

  return { check, state };
}

/* Grade the current card without assuming which side it is showing.
   Assuming state instead of reading it is how three of these tests broke
   during development. */
export async function gradeOne(page, correct = true) {
  if (!(await page.locator('.grade').isVisible())) {
    await page.locator('#card').click();
    await page.waitForTimeout(15);
  }
  await page.locator(correct ? '#gotBtn' : '#missedBtn').click();
  await page.waitForTimeout(15);
}

export async function finishSession(page) {
  for (let i = 0; i < 25; i += 1) {
    if (await page.locator('.view--summary').isVisible()) return;
    await gradeOne(page, true);
  }
}

/* Replace saved progress wholesale, then reload so the app reads it fresh.
   Lets a test describe any point in a months-long study history in one line. */
export async function seedProgress(page, words) {
  await page.evaluate(w => localStorage.setItem('vocapp.progress',
    JSON.stringify({ v: 1, words: w })), words);
  await page.reload();
  await page.waitForTimeout(900);
}
