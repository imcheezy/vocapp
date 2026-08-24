#!/usr/bin/env python3
"""
Build the HSK 3.0 word lists the app ships with.

Run:  python3 tools/build-data.py

Downloads the upstream vocabulary dataset, reshapes it into the small, flat
form the app actually needs, and writes data/hsk3-L1.js .. hsk3-L4.js.

This script is committed on purpose. The alternative -- generating the data
once and hand-editing it forever after -- means that in six months nobody can
answer "where did this come from?" or regenerate it when upstream improves.
A data file you cannot rebuild is a data file you cannot trust.

Source: https://github.com/drkameleon/complete-hsk-vocabulary  (MIT licensed)
"""

import json
import re
import urllib.request
from pathlib import Path

SOURCE = ("https://raw.githubusercontent.com/drkameleon/"
          "complete-hsk-vocabulary/main/wordlists/exclusive/new/{level}.json")
LEVELS = [1, 2, 3, 4]
OUT_DIR = Path(__file__).resolve().parent.parent / "data"

# Upstream tags every word with a part-of-speech code. Only a handful show up
# in HSK 1-4; anything unmapped is dropped rather than shown as a cryptic
# letter on the card.
POS_LABELS = {
    "n": "noun", "ng": "noun", "nr": "name", "ns": "place", "nt": "org",
    "nz": "name", "v": "verb", "vg": "verb", "vn": "verb", "vd": "verb",
    "a": "adjective", "ag": "adjective", "an": "adjective", "ad": "adjective",
    "b": "adjective", "z": "adjective", "d": "adverb", "dg": "adverb",
    "p": "preposition", "c": "conjunction", "cc": "conjunction",
    "u": "particle", "y": "particle", "q": "measure word", "qv": "measure word",
    "qt": "measure word", "m": "number", "mg": "number", "r": "pronoun",
    "rg": "pronoun", "t": "time", "tg": "time", "s": "place",
    "f": "direction", "e": "interjection", "o": "onomatopoeia", "i": "idiom",
    "l": "phrase", "j": "abbreviation", "h": "prefix", "k": "suffix",
}

# Meanings starting like this are dictionary cross-references, not definitions
# -- "used in 自个儿", "variant of 什麼". A form whose meanings are all stubs is
# never the form to teach.
STUB = re.compile(r"^\s*(used in|see |variant of|old variant|erhua variant"
                  r"|unofficial variant)", re.I)

# "surname Jiang" is a dictionary entry, not a definition. 江 means *river*;
# without this the surname reading wins and the card teaches the wrong word.
# Anchored to the whole string on purpose: 姓名 legitimately means "surname
# and given name", and a looser rule would discard that real definition.
SURNAME = re.compile(r"^\s*surname\s+\S+\s*$", re.I)

# Readings marked like this are literary or obsolete. 那 has an archaic reading
# `nuó` meaning "many; beautiful" -- not the 那 you need for "that".
ARCHAIC = re.compile(r"\b(archaic|old form|literary)\b", re.I)

# Pinyin tone marks. A syllable carrying none of these is neutral tone.
TONED = re.compile(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]")

# Codes meaning "this word IS a name", so a capitalised reading is right for it
# (中国 Zhōngguó). For any other word a capitalised reading is a surname entry,
# which is almost never what HSK is testing.
NAME_POS = {"nr", "ns", "nt", "nz"}

# When a word is primarily a particle, the reading you want is the
# neutral-tone one: 了 le, not liǎo; 着 zhe, not zháo.
PARTICLE_POS = {"u", "y"}

# The rules below get 405 multi-reading words right in the large majority of
# cases, but rules cannot resolve genuine ambiguity. These are decided by hand
# against what HSK actually tests. Keeping them here, explicit and few, is
# better than bending the rules until they happen to fit.
# Three words define themselves only by pointing at another entry ("see
# 干嘛"), which is useless on a flashcard. Written out by hand -- and the
# build warns if upstream ever adds more, so this stays honest.
DEFINITIONS = {
    "纪录": "record (a documented best performance)",
    "干吗": "what are you doing?; why on earth?",
    "老头儿": "old man; old fellow",
}

OVERRIDES = {
    "几": "jǐ",       # how many -- not jī "small table"
    "得": "de",       # structural particle -- not dé "to obtain"
    "地": "de",       # adverbial particle -- but see note in README
}


def pick_form(word):
    """
    Choose which pronunciation of a word to teach.

    This function has been wrong twice, and both bugs are worth remembering.

    Attempt 1 -- "take forms[0]" -- gave 个 the reading `gě`, an obscure
    regional form appearing only inside 自个儿, instead of the `gè` measure
    word you meet in every other sentence.

    Attempt 2 -- "take the form with the most meanings" -- fixed 个 and broke
    了, 那 and 着. Obscure literary readings accumulate MORE dictionary entries
    than common grammatical particles do, so counting meanings actively
    selects for obscurity. The metric was the bug.

    What follows scores each reading instead: reject cross-reference stubs,
    push down surnames and archaic readings, pull up the neutral-tone reading
    when the word is a particle, and only then prefer breadth of meaning.
    """
    forms = word["forms"]
    codes = word.get("pos") or []

    wanted = OVERRIDES.get(word["simplified"])
    if wanted:
        for form in forms:
            if form["transcriptions"]["pinyin"].replace(" ", "") == wanted:
                return form

    is_name_word = bool(NAME_POS & set(codes))
    is_particle_word = bool(codes) and codes[0] in PARTICLE_POS

    def score(form):
        meanings = form["meanings"]
        real = [m for m in meanings
                if not STUB.match(m) and not SURNAME.match(m)]
        pinyin = form["transcriptions"]["pinyin"]

        # A form with nothing but cross-references is never teachable.
        usable = 1 if real else 0

        # Capitalised pinyin means a proper noun. Right only for name words.
        capitalised = pinyin[:1].isupper()
        not_a_surname = 0 if (capitalised and not is_name_word) else 1

        # Archaic and literary readings lose to living ones.
        modern = 0 if any(ARCHAIC.search(m) for m in real) else 1

        # For particles, prefer the neutral-tone reading.
        neutral = 1 if (is_particle_word and not TONED.search(pinyin)) else 0

        return (usable, not_a_surname, modern, neutral, len(real))

    return max(forms, key=score)


def tidy_pinyin(raw):
    """
    'xǐ huan' -> 'xǐhuan'

    Upstream separates every syllable with a space, which is how dictionaries
    store pinyin. Standard written orthography joins the syllables of a single
    word -- and that is what your textbook shows, so it is what the card
    should show.
    """
    return "".join(raw.split())


def tidy_english(form, hanzi=""):
    """
    Keep the definition short enough to read at a glance.

    Upstream meanings are already semicolon-separated lists ("to know; to
    recognize; to be familiar with"), so one entry is often plenty. Add a
    second only when the first is brief.
    """
    if hanzi in DEFINITIONS:
        return DEFINITIONS[hanzi]

    real = [m.strip() for m in form["meanings"] if not STUB.match(m)]
    if not real:
        real = [m.strip() for m in form["meanings"]]
    if not real:
        return ""

    english = real[0]
    if len(english) < 45 and len(real) > 1:
        english += "; " + real[1]
    return english


def pos_label(word, form):
    """
    Upstream lists every part of speech a word can take, name codes included.
    If the reading we chose is not a proper noun (not capitalised), a "name"
    label is simply wrong -- 江 is a noun meaning river, not a surname.
    """
    is_proper = form["transcriptions"]["pinyin"][:1].isupper()
    for code in word.get("pos") or []:
        if code in NAME_POS and not is_proper:
            continue
        if code in POS_LABELS:
            return POS_LABELS[code]
    return ""


def build_level(level):
    url = SOURCE.format(level=level)
    print(f"  fetching HSK {level} ...", end="", flush=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        raw = json.load(response)
    print(f" {len(raw)} words")

    words = []
    for entry in raw:
        form = pick_form(entry)
        english = tidy_english(form, entry["simplified"])
        if not english:
            continue  # a word with no usable definition cannot be a flashcard

        words.append({
            # The id is the CHARACTERS themselves, not a row number.
            # Study progress is stored against this id. If ids were positional
            # ("1-0042"), one word added upstream would shift every id after
            # it and silently reassign your history to the wrong words.
            # Content-based ids cannot drift.
            "id": entry["simplified"],
            "hanzi": entry["simplified"],
            "pinyin": tidy_pinyin(form["transcriptions"]["pinyin"]),
            "english": english,
            "pos": pos_label(entry, form),
            # Lower number = more common. Lets a session teach 好 before 尴尬.
            "freq": entry.get("frequency") or 999999,
            "level": level,
        })

    words.sort(key=lambda w: w["freq"])
    return words


def main():
    OUT_DIR.mkdir(exist_ok=True)
    print("Building HSK 3.0 word lists\n")

    seen = {}
    total = 0

    for level in LEVELS:
        words = build_level(level)

        # Ids must be unique across the whole app, not just within a level --
        # progress is keyed by id alone.
        for word in words:
            if word["id"] in seen:
                print(f"    ! duplicate id {word['id']!r} "
                      f"(HSK {seen[word['id']]} and HSK {level})")
            seen[word["id"]] = level
            low = word["english"].lower()
            if low.startswith(("used in", "see ", "variant of", "old variant")):
                print(f"    ! {word['id']} has no real definition "
                      f"({word['english'][:40]!r}) -- add it to DEFINITIONS")

        path = OUT_DIR / f"hsk3-L{level}.js"
        body = json.dumps(words, ensure_ascii=False, indent=0,
                          separators=(",", ":"))
        path.write_text(
            "// Generated by tools/build-data.py -- do not edit by hand.\n"
            "// Source: github.com/drkameleon/complete-hsk-vocabulary (MIT)\n"
            "window.HSK = window.HSK || {};\n"
            f"window.HSK[{level}] = {body};\n",
            encoding="utf-8",
        )
        size = path.stat().st_size / 1024
        print(f"  wrote {path.name}: {len(words)} words, {size:.0f} KB\n")
        total += len(words)

    print(f"Total: {total} words across {len(LEVELS)} levels")


if __name__ == "__main__":
    main()
