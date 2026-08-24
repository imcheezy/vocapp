/* The app as it will actually be deployed: served over http, not file://.
   Run:  node tests/served.test.mjs

   Everything else is tested over file:// because that is how the app is
   opened locally. This file covers the other half — the manifest, the icons
   and the home-screen metadata only work when something is serving the files.

   The server here is twenty lines of Node's own http module rather than a
   package, so running the tests still needs nothing but Playwright.
*/
import { chromium, ROOT, SHOTS, makeChecker, gradeOne } from './_setup.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const { check, state } = makeChecker();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
};

const requested = [];
const missing = [];

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  requested.push(urlPath);

  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // Never serve outside the repository, even in a test.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      missing.push(urlPath);
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;
console.log(`serving ${ROOT} at ${BASE}\n`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();

const errors = [];
const failedRequests = [];
page.on('pageerror', e => errors.push('JS ERROR: ' + e.message));
page.on('response', r => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });

await page.goto(BASE);
await page.waitForTimeout(1500);

console.log('=== everything the page asks for exists ===');
check('no 404s from the app', failedRequests.filter(u => !u.includes('fonts.g')), []);
check('word lists loaded', await page.evaluate(() => Object.keys(window.HSK).length), 4);
check('home screen rendered', await page.locator('.view--home').isVisible(), true);

console.log('\n=== home-screen install metadata ===');
const manifestHref = await page.locator('link[rel=manifest]').getAttribute('href');
check('manifest linked', manifestHref, 'manifest.json');

const manifest = await page.evaluate(async href => {
  const response = await fetch(href);
  return response.ok ? response.json() : null;
}, manifestHref);
check('manifest parses',        manifest !== null, true);
check('app name',               manifest.name, '生词 — HSK Flashcards');
check('launches without chrome', manifest.display, 'standalone');
check('two icons declared',     manifest.icons.length, 2);

for (const icon of manifest.icons) {
  const ok = await page.evaluate(async src => {
    const response = await fetch(src);
    return response.ok && response.headers.get('content-type') === 'image/png';
  }, icon.src);
  check(`icon ${icon.sizes} is a real PNG`, ok, true);
}

const appleIcon = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
check('apple touch icon linked', appleIcon, 'icon-180.png');
check('apple icon resolves', await page.evaluate(async s => (await fetch(s)).ok, appleIcon), true);

const themes = await page.evaluate(() =>
  Array.from(document.querySelectorAll('meta[name="theme-color"]'))
       .map(m => ({ media: m.media, content: m.content })));
check('a theme colour per scheme', themes.length, 2);
check('dark theme colour matches the page background',
  themes.find(t => t.media.includes('dark')).content, '#12131a');

console.log('\n=== the app actually works when served ===');
check('storage usable over http', await page.evaluate(() => {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch { return false; }
}), true);

await page.locator('#startBtn').click();
await page.waitForTimeout(250);
check('session starts', await page.locator('.view--study').isVisible(), true);

for (let i = 0; i < 20; i += 1) await gradeOne(page, i % 4 !== 0);
await page.waitForTimeout(250);
check('session completes',   await page.locator('.view--summary').isVisible(), true);
check('score recorded',      await page.locator('#scoreCorrect').textContent(), '15');
check('progress persisted',  await page.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('vocapp.progress')).words).length), 20);

await page.locator('#homeBtn').click();
await page.waitForTimeout(200);
check('studied count reads back', await page.locator('#statStudied').textContent(), '20');
await page.screenshot({ path: `${SHOTS}/served-home.png` });

console.log('\n=== relative paths only (nothing hardcoded to a domain) ===');
const absolute = await page.evaluate(() =>
  Array.from(document.querySelectorAll('link[href], script[src], img[src]'))
    .map(el => el.getAttribute('href') || el.getAttribute('src'))
    .filter(v => v && (v.startsWith('/') || (v.startsWith('http') && !v.includes('fonts.g')))));
check('no absolute local paths', absolute, []);

console.log(`\n        ${requested.length} files requested, ${missing.length} missing`);

await ctx.close();
await browser.close();
server.close();

console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No JS errors.'));
console.log(state.fails === 0 ? '\nALL CHECKS PASSED' : `\n${state.fails} CHECK(S) FAILED`);
process.exit(state.fails === 0 && errors.length === 0 ? 0 : 1);
