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

## Keyboard shortcuts

On a laptop, studying is faster without the mouse:

| Key | Does |
|---|---|
| `space` | Flip the card |
| `→` or `2` | Got it |
| `←` or `1` | Missed it |

Arrow keys only work once the answer is showing — grading a card you have not
looked at is just cheating.

## Tests

The app itself has no dependencies. The tests do: they drive a real browser.

```
npm install -D playwright
node tests/run.mjs
```

Or run one area at a time, e.g. `node tests/scheduling.test.mjs`.

157 assertions across five files, run over `file://` — the same way the app is
actually opened, so the tests would catch the class of problem that made the
word lists `.js` instead of `.json` in the first place.

## Status

Slice 7 of 8: a working spaced-repetition study tool. Choose your levels
(HSK 1–4) and direction (中 → EN, EN → 中, or mixed); each session serves the
cards that are actually due, tops up with new words, and remembers everything
between visits.

Only deployment remains.

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
