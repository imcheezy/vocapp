# 生词 — HSK Flashcards

A flashcard web app for HSK 3.0 vocabulary (levels 1–4).

## Running it

There is nothing to install. Open `index.html` in any browser — double-click
the file, or drag it onto a browser window.

## The files

| File | What it holds |
|---|---|
| `index.html` | Structure — what exists on the page |
| `style.css` | Appearance — how it looks |
| `app.js` | Behaviour — what happens when you interact |
| `data/hsk3-L*.js` | The word lists, one file per HSK level |
| `tools/build-data.py` | Regenerates the word lists from source |

## Where the words come from

The vocabulary is built from
[complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary)
(MIT licensed), reshaped by `tools/build-data.py`.

To rebuild after upstream changes:

```
python3 tools/build-data.py
```

Nothing else is needed — no packages, no virtualenv.

| Level | Words shipped | Official HSK 3.0 spec |
|---|---|---|
| 1 | 506 | 500 |
| 2 | 750 | 772 |
| 3 | 953 | 973 |
| 4 | 972 | 1,000 |
| **Total** | **3,181** | **3,245** |

### Please check the definitions against your textbook

These translations come from a community dictionary, not from the official
HSK word list, and the counts above show it does not match the spec exactly.

Roughly one word in eight (405 of 3,181) has more than one possible
pronunciation, and choosing between them is done by rules in
`tools/build-data.py` plus a short hand-written override list. Those rules are
right in the large majority of cases and have already been wrong twice during
development — 个 was nearly shipped as `gě`, and 了 as `liǎo`.

**A memorised wrong definition is worse than no definition.** If something
looks off against your textbook, it probably is. Fixes go in the `OVERRIDES`
or `DEFINITIONS` tables in `tools/build-data.py`, so they survive a rebuild.

## Exporting words to revise

The home screen offers a CSV of the words you keep getting wrong, so you can
print them, paste them into a spreadsheet, or work through them away from a
screen. The summary screen exports just that session's misses.

A word counts as "to revise" if **either**:

- it is still in **box 1 or 2** — recent answers have been wrong; or
- you have seen it **at least 3 times** and get it right **less than 60%** of
  the time.

The second rule exists to catch a specific failure the first one misses: a
word you answer correctly just often enough to keep climbing the boxes, then
miss again. Its box hovers in the middle forever, so a box test alone would
never flag it — yet it is exactly the word eating your study time.

Rows are ordered weakest first, and cover the levels currently selected. The
two study directions appear as separate rows, because they are separate things
to know.

The file opens cleanly in Excel, Numbers and Google Sheets — it is written
with a byte-order mark, without which Excel on Windows renders every Chinese
character as mojibake. If your browser blocks the download (iOS sometimes
does), **Copy** puts the same rows on the clipboard to paste straight into a
spreadsheet.

## Keyboard shortcuts

On a laptop, studying is faster without the mouse:

| Key | Does |
|---|---|
| `space` | Flip the card |
| `→` or `2` | Got it |
| `←` or `1` | Missed it |

Arrow keys only work once the answer is showing — grading a card you have not
looked at is just cheating.

## Putting it on the internet

The app is a folder of files, so "deploying" means: copy them onto a web
server and get a URL back. There is nothing to build and no server-side code.

`.github/workflows/deploy.yml` does this with GitHub Pages on every push to
`main`. Before the first run, switch Pages on once:

**Settings → Pages → Build and deployment → Source: "GitHub Actions"**

Then merge to `main` (or use the Actions tab → Deploy to GitHub Pages → Run
workflow). The URL appears in the workflow output and under Settings → Pages.

> **GitHub Pages on a private repository requires a paid plan.** On a free
> account the repository has to be public for Pages to serve it. If you would
> rather keep it private, any static host with a free tier works the same way —
> the files are the whole app.

Whoever has the URL can open the app. That exposes no personal data: study
progress lives in each visitor's own browser, never on the server.

### On your phone

Open the URL, then **Add to Home Screen**. It launches with its own icon and
no browser chrome, because of `manifest.json` and the icons beside it.

Remember that progress is per-device: your phone and your laptop keep separate
records.

## Tests

The app itself has no dependencies. The tests do: they drive a real browser.

```
npm ci
npx playwright install chromium
npm test
```

Or run one area at a time, e.g. `node tests/scheduling.test.mjs`.

207 assertions across seven files. They also run automatically on every pull
request and every push to `main` — see `.github/workflows/test.yml`.

`package.json` exists only to pin Playwright for the tests. **The app itself
still has no dependencies**: `index.html` opens in a browser with nothing
installed, and nothing from `node_modules` is ever served.

Most files drive the app over `file://` — the same way it is opened locally —
so they would catch the class of problem that made the word lists `.js` rather
than `.json`. `served.test.mjs` covers the other half, starting a small server
so the manifest, icons and home-screen metadata can be checked the way they
will actually be delivered.

## Status

Complete — slice 8 of 8: a working spaced-repetition study tool. Choose your levels
(HSK 1–4) and direction (中 → EN, EN → 中, or mixed); each session serves the
cards that are actually due, tops up with new words, and remembers everything
between visits.

Deployment is configured and waiting on the one settings change above.

Word order within a session puts content words before grammar words. The
most frequent Chinese words are overwhelmingly grammatical (的, 了, 着), and
those make poor flashcards: their meaning is a grammatical function rather
than a thing, so self-grading has no clean answer. This is a teaching policy
and lives in `app.js`, not in the word data.

**Known rough edge:** on EN → 中 cards the prompt is the full dictionary
definition, which for grammar-heavy words can be a mouthful. Shortening the
prompt to its first sense is queued for the polish slice.

## What is saved, and where

Progress lives in your browser's `localStorage`, under two keys:

| Key | Holds |
|---|---|
| `vocapp.settings` | Which levels and direction you chose |
| `vocapp.progress` | One record per word per direction: box, next-due date, times seen, times correct |

Nothing leaves your device and there is no account. The trade-off, accepted
deliberately: **progress is per-device and per-browser.** Studying on your
laptop will not show up on your phone.

The word lists are never stored — they ship with the app and are read-only.
That is what makes it safe to update a translation or add a level without
touching anything you have learned. There is a test that swaps a word list
underneath a saved session and asserts every record survives untouched.

Clearing your browser's site data for this page will erase your progress.

## How scheduling works

Every card sits in a numbered box. Answer correctly and it moves up, and you
see it less often. Answer wrong and it drops straight back to box 1.

| Box | Next review |
|---|---|
| 1 | tomorrow |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 21 days |
| 5 | 60 days |

A session takes the most overdue cards first — among equally overdue cards,
the ones in the lowest box, since those are closest to being forgotten — then
fills the remaining space with new words. Reviews always come before new
material: forgetting something you already paid to learn costs more than
learning one fewer new word today.

Cards that are not due yet are skipped entirely. That is the point — not
seeing a card you already know is the whole saving.

Because progress is tracked per direction, a word can be due 中 → EN while
still resting EN → 中. That is intentional: you can lose the ability to
produce a word while still recognising it.
