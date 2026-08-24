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

## Status

Slice 2 of 8: flips through a real 20-word session drawn from HSK 1.
Grading, level selection, saved progress and spaced repetition are still to
come.
