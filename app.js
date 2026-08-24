/* ==========================================================================
   生词 — behaviour

   Slice 4: choose your levels and direction, then study.

   ---------------------------------------------------------------------------
   WHY THE WORD LISTS ARE .js FILES AND NOT .json

   The obvious way to load data on the web is fetch('data/hsk3-L1.json').
   It does not work here, and the reason is worth knowing.

   When you open a file by double-clicking it, the browser uses the file://
   protocol. For security, browsers refuse to let a file:// page fetch other
   files — otherwise any HTML file you downloaded could quietly read the rest
   of your disk. So fetch() fails, and the app shows nothing.

   The usual workaround is "run a local web server", which means installing
   tooling and using a terminal every time you want to study. That trades a
   real cost for a theoretical tidiness.

   <script> tags are exempt from that restriction. So each word list is a
   small .js file that adds itself to window.HSK. Double-clicking index.html
   works, and so does the deployed version. Same code, both places.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   CONFIGURATION
   -------------------------------------------------------------------------- */
const SESSION_SIZE = 20;              // cards per session
const ALL_LEVELS   = [1, 2, 3, 4];

/* Grammar words are taught after content words.

   The most frequent words in Chinese are overwhelmingly grammatical — 的, 了,
   着. They are worth knowing, but they make poor *flashcards*: their meaning
   is a grammatical function, not a thing you can picture, so "did I get it
   right?" has no clean answer. Front-loading them by frequency alone means
   your first twenty cards are the twenty hardest to self-grade.

   So content words come first, grammar words after, each group still ordered
   by frequency. Note this lives in the app, not in the data: which words to
   teach first is a teaching decision, not a fact about the language. The word
   lists stay neutral so a future screen can order them differently. */
const FUNCTION_POS = ['particle', 'preposition', 'conjunction'];


/* --------------------------------------------------------------------------
   SPACED-REPETITION BOXES

   Written from this slice onward even though nothing schedules by them yet —
   Slice 6 turns them into a review queue. Recording them now means that when
   scheduling arrives, you already have real history instead of starting over.
   -------------------------------------------------------------------------- */
const BOX_DAYS = { 1: 1, 2: 3, 3: 7, 4: 21, 5: 60 };
const MAX_BOX = 5;

/* ==========================================================================
   STORAGE

   Everything the app remembers between visits lives in localStorage — a small
   key/value store the browser keeps per site, on this device. No account, no
   server, nothing leaves your machine.

   Two separate keys, and the separation is the whole point:

     vocapp.settings  — what you chose (levels, direction)
     vocapp.progress  — what you have learned

   The word lists are NOT stored. They ship with the app and are read-only.
   That is what lets a corrected translation or a new HSK level be delivered
   without touching a single thing you have learned. There is a test for
   exactly this.
   ========================================================================== */
const KEY_SETTINGS = 'vocapp.settings';
const KEY_PROGRESS = 'vocapp.progress';

/* Stored data carries a version number from day one.

   It costs one field today and saves a great deal later: the day the shape of
   a progress record needs to change, this is what tells you whether the data
   you just read is the old shape or the new one. Without it you are guessing
   about data you can no longer reproduce. */
const STORAGE_VERSION = 1;

/* Every read and write is wrapped, because localStorage genuinely throws:
   private browsing mode can refuse writes, a user can disable site data, and
   storage can be full. None of those should take the app down — losing your
   saved progress is bad, but a blank screen is worse. */
function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== STORAGE_VERSION) {
      // A version we don't recognise. Today there is only one, so this can
      // only mean corrupted or hand-edited data; ignore it rather than crash.
      return fallback;
    }
    return parsed;
  } catch (error) {
    console.warn('Could not read ' + key + ':', error);
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(Object.assign({ v: STORAGE_VERSION }, value)));
    return true;
  } catch (error) {
    console.warn('Could not save ' + key + ':', error);
    return false;
  }
}

/* --------------------------------------------------------------------------
   DATES

   Deliberately NOT using toISOString(). That returns UTC, so for anyone west
   of Greenwich it can report yesterday's date all evening — cards would come
   due a day early or late depending on where you are and what time you study.
   These build the date in your own timezone.
   -------------------------------------------------------------------------- */
function pad2(n) { return String(n).padStart(2, '0'); }

function asDay(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function today() {
  return asDay(new Date());
}

/* setDate() past the end of a month rolls into the next one on its own, so
   this handles month and year boundaries without any special cases. */
function addDays(day, days) {
  const parts = day.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + days);
  return asDay(date);
}

/* --------------------------------------------------------------------------
   PROGRESS RECORDS

   One record per word PER DIRECTION. Recognising 喜欢 and producing it from
   "to like" are separate things to know, so they are scored separately —
   which is why the deck has carried a direction since Slice 4.
   -------------------------------------------------------------------------- */
function progressKey(wordId, direction) {
  return wordId + ':' + direction;
}

function recordResult(wordId, direction, correct) {
  const key = progressKey(wordId, direction);
  const previous = state.progress[key];

  const record = previous ? Object.assign({}, previous) : {
    box: 1,
    due: today(),
    seen: 0,
    correct: 0,
    lastSeen: null,
  };

  record.seen += 1;
  if (correct) record.correct += 1;
  record.lastSeen = today();

  // Leitner: a right answer moves the card up a box and pushes the next
  // review further out; a wrong answer sends it straight back to box 1.
  record.box = correct ? Math.min(record.box + 1, MAX_BOX) : 1;
  record.due = addDays(today(), BOX_DAYS[record.box]);

  state.progress[key] = record;
}

function saveProgress() {
  writeStore(KEY_PROGRESS, { words: state.progress });
}

function saveSettings() {
  writeStore(KEY_SETTINGS, {
    levels: state.settings.levels,
    direction: state.settings.direction,
  });
}

/* --------------------------------------------------------------------------
   ELEMENTS
   -------------------------------------------------------------------------- */
const levelsBox    = document.getElementById('levels');
const directionBox = document.getElementById('direction');
const statWords    = document.getElementById('statWords');
const statStudied  = document.getElementById('statStudied');
const statDue      = document.getElementById('statDue');
const homeNote     = document.getElementById('homeNote');
const startSub     = document.getElementById('startSub');
const startBtn     = document.getElementById('startBtn');

const card         = document.getElementById('card');
const frontHanzi   = document.getElementById('frontHanzi');
const frontPrompt  = document.getElementById('frontPrompt');
const backHanzi    = document.getElementById('backHanzi');
const backPinyin   = document.getElementById('backPinyin');
const backEnglish  = document.getElementById('backEnglish');
const backPos      = document.getElementById('backPos');
const hint         = document.getElementById('hint');
const progressFill = document.getElementById('progressFill');
const missedBtn    = document.getElementById('missedBtn');
const gotBtn       = document.getElementById('gotBtn');

const scoreCorrect = document.getElementById('scoreCorrect');
const scoreTotal   = document.getElementById('scoreTotal');
const scoreFill    = document.getElementById('scoreFill');
const missedCount  = document.getElementById('missedCount');
const missedList   = document.getElementById('missedList');
const againBtn     = document.getElementById('againBtn');
const homeBtn      = document.getElementById('homeBtn');

/* --------------------------------------------------------------------------
   THE STATE

   Two groups now, and the split is deliberate.

   `settings` is what YOU chose. It outlives any one session, and in Slice 5
   it becomes the first thing saved to your browser.

   Everything below it describes the session happening right now, and is
   thrown away when you go back to Home.

   Keeping them apart means "start another session" resets one group and
   leaves the other alone — no need to carefully remember which fields to
   preserve.
   -------------------------------------------------------------------------- */
const state = {
  screen: 'home',                                // 'home' | 'study' | 'summary'
  settings: { levels: [1], direction: 'cn2en' }, // your choices
  progress: {},                                  // everything you have learned

  deck: [],          // cards in this session
  index: 0,          // which one we're on
  revealed: false,   // is the answer showing?
  results: [],       // one entry per graded card
};

/* --------------------------------------------------------------------------
   READING THE FORM

   The checkboxes and radios ARE the interface — we don't mirror their state
   anywhere. When something changes, we ask the form what it says and copy
   that into settings. One source of truth, as ever.
   -------------------------------------------------------------------------- */
function readSettings() {
  const checked = levelsBox.querySelectorAll('input:checked');
  state.settings.levels = Array.from(checked).map(function (input) {
    return Number(input.value);
  });

  const direction = directionBox.querySelector('input:checked');
  state.settings.direction = direction ? direction.value : 'cn2en';

  saveSettings();
}

/* The reverse: put saved settings back INTO the form. The form stays the one
   source of truth for what is selected, so restoring means ticking the real
   boxes, not keeping a second copy of the answer somewhere. */
function applySettings(settings) {
  if (!settings) return;

  if (Array.isArray(settings.levels)) {
    for (const input of levelsBox.querySelectorAll('input')) {
      input.checked = settings.levels.includes(Number(input.value));
    }
  }

  if (settings.direction) {
    const match = directionBox.querySelector('input[value="' + settings.direction + '"]');
    if (match) match.checked = true;
  }
}

function wordsForLevels(levels) {
  let pool = [];
  for (const level of levels) {
    const words = window.HSK && window.HSK[level];
    if (words) {
      pool = pool.concat(words);
    }
  }
  return pool;
}

/* --------------------------------------------------------------------------
   CHOOSING WHAT TO STUDY  (spaced repetition)

   Until now a session was "the first 20 words in the list", which meant
   studying the same words forever no matter what you already knew.

   Now every candidate card falls into one of three groups:

     DUE     — studied before, and its next-review date has arrived
     WAITING — studied before, not due yet. Skipped entirely. This is the
               whole point: not seeing a card you know is the saving.
     NEW     — never studied in this direction

   A session takes the most overdue cards first, then tops up with new words
   if there is room. Reviews before new material, always — the cost of
   forgetting something you already paid to learn is higher than the cost of
   learning one fewer new word today.
   -------------------------------------------------------------------------- */

/* The reading order for words you have not met yet: most common first, but
   content words before grammar words (see FUNCTION_POS above). */
function orderedPool(levels) {
  const pool = wordsForLevels(levels).slice();
  pool.sort(function (a, b) { return a.freq - b.freq; });

  const isGrammar = function (word) { return FUNCTION_POS.includes(word.pos); };
  return pool.filter(function (w) { return !isGrammar(w); }).concat(pool.filter(isGrammar));
}

/* Which directions are in play. "Mixed" genuinely means both — and since
   progress is tracked per direction, a word can be due one way and not the
   other. That is correct: you can lose the ability to produce a word while
   still recognising it. */
function activeDirections() {
  if (state.settings.direction === 'mixed') return ['cn2en', 'en2cn'];
  return [state.settings.direction];
}

function planSession() {
  const pool = orderedPool(state.settings.levels);
  const directions = activeDirections();
  const mixed = state.settings.direction === 'mixed';
  const now = today();

  const due = [];
  const fresh = [];

  for (const word of pool) {
    // A brand-new word under "mixed" is introduced in ONE direction, picked at
    // random — not both at once. Meeting a word for the first time twice in
    // the same session teaches nothing the second time.
    const freshDirection = mixed
      ? (Math.random() < 0.5 ? 'cn2en' : 'en2cn')
      : directions[0];

    for (const direction of directions) {
      const record = state.progress[progressKey(word.id, direction)];

      if (!record) {
        if (direction === freshDirection) {
          fresh.push({ word: word, direction: direction });
        }
      } else if (record.due <= now) {
        // Dates are stored as YYYY-MM-DD, which sorts and compares correctly
        // as plain text — no date parsing needed to ask "is this due yet?".
        due.push({ word: word, direction: direction, record: record });
      }
      // else: waiting. Deliberately skipped.
    }
  }

  // Most overdue first; among equally overdue cards, the weakest box first,
  // because those are the ones closest to being forgotten.
  due.sort(function (a, b) {
    if (a.record.due !== b.record.due) return a.record.due < b.record.due ? -1 : 1;
    return a.record.box - b.record.box;
  });

  return { due: due, fresh: fresh };
}

function buildDeck() {
  const plan = planSession();

  const deck = [];
  const usedWords = new Set();

  // No word appears twice in one session, even under "mixed" where it could
  // legitimately be due in both directions. Seeing 我 twice in twenty cards
  // feels like a bug whether or not it is one.
  function take(candidates) {
    for (const candidate of candidates) {
      if (deck.length >= SESSION_SIZE) return;
      if (usedWords.has(candidate.word.id)) continue;

      usedWords.add(candidate.word.id);
      deck.push({ word: candidate.word, direction: candidate.direction });
    }
  }

  take(plan.due);     // reviews first
  take(plan.fresh);   // then new material, if there is room

  return deck;
}

/* --------------------------------------------------------------------------
   RENDER — THE ONE FUNCTION THAT TOUCHES THE SCREEN

   render() reads `state` and makes the screen match it. Nothing else in this
   file writes to the page. So the whole app is:

       change state  ->  call render()

   One helper per screen. Each owns its own screen and none of them knows the
   others exist.
   -------------------------------------------------------------------------- */
function render() {
  document.body.classList.toggle('screen-home',    state.screen === 'home');
  document.body.classList.toggle('screen-study',   state.screen === 'study');
  document.body.classList.toggle('screen-summary', state.screen === 'summary');

  if (state.screen === 'home')    renderHome();
  if (state.screen === 'study')   renderStudy();
  if (state.screen === 'summary') renderSummary();
}

function renderHome() {
  const words = wordsForLevels(state.settings.levels);
  const plan = planSession();

  // How many of the selected words you have studied at least once, in either
  // direction. Counting distinct words rather than records, so a word drilled
  // both ways counts once — that matches what "studied" means to a person.
  const studied = new Set();
  for (const key of Object.keys(state.progress)) {
    studied.add(key.slice(0, key.lastIndexOf(':')));
  }
  const studiedHere = words.filter(function (w) { return studied.has(w.id); }).length;

  // toLocaleString puts the thousands separator in: 3181 -> "3,181"
  statDue.textContent     = plan.due.length.toLocaleString();
  statStudied.textContent = studiedHere.toLocaleString();
  statWords.textContent   = words.length.toLocaleString();

  // What the next session would actually contain. Building the real deck
  // rather than guessing means the button can never promise cards the session
  // will not deliver.
  const deck = buildDeck();
  const reviews = deck.filter(function (item) {
    return Boolean(state.progress[progressKey(item.word.id, item.direction)]);
  }).length;
  const introductions = deck.length - reviews;

  startSub.textContent = describeDeck(reviews, introductions);

  // Two reasons the button might be dead, and each says which one it is.
  // A disabled control with no explanation is just a broken control.
  let note = '';
  if (state.settings.levels.length === 0) {
    note = 'Choose at least one level.';
  } else if (deck.length === 0) {
    note = 'Nothing due, and no new words left at these levels. Come back tomorrow, or add a level.';
  }

  homeNote.textContent = note;
  document.body.classList.toggle('cannot-start', note !== '');
  startBtn.disabled = note !== '';
}

/* Say what the session is, rather than always claiming "20 cards". */
function describeDeck(reviews, introductions) {
  const parts = [];
  if (reviews) parts.push(reviews + ' review' + (reviews === 1 ? '' : 's'));
  if (introductions) parts.push(introductions + ' new');
  return parts.length ? parts.join(' · ') : 'nothing due';
}

function renderStudy() {
  const item = state.deck[state.index];
  if (!item) return;

  const word = item.word;
  const askingForChinese = item.direction === 'en2cn';

  // Which prompt this card shows, and how the back is laid out.
  document.body.classList.toggle('dir-en2cn', askingForChinese);

  frontHanzi.textContent  = word.hanzi;    // shown on 中 → EN
  frontPrompt.textContent = word.english;  // shown on EN → 中

  backHanzi.textContent   = word.hanzi;
  backPinyin.textContent  = word.pinyin;
  backEnglish.textContent = word.english;
  backPos.textContent     = word.pos;
  backPos.hidden          = !word.pos;

  document.body.classList.toggle('is-revealed', state.revealed);

  hint.textContent = 'tap to reveal';

  // The bar fills as cards are GRADED, not as they are revealed — it measures
  // work finished, not work looked at.
  progressFill.style.width = (state.index / state.deck.length * 100) + '%';

  const position = `Card ${state.index + 1} of ${state.deck.length}`;
  const prompt = askingForChinese ? word.english : word.hanzi;
  card.setAttribute('aria-label', state.revealed
    ? `${word.hanzi}, ${word.pinyin}, ${word.english}. ${position}. Grade it below, or tap to hide the answer.`
    : `${prompt}. ${position}. Tap to reveal the answer.`);
}

function renderSummary() {
  const total = state.results.length;
  const missed = state.results.filter(function (r) { return !r.correct; });
  const correct = total - missed.length;

  scoreCorrect.textContent = correct;
  scoreTotal.textContent   = total;
  scoreFill.style.width    = (total ? correct / total * 100 : 0) + '%';

  // Drives which of "review these" / "nothing missed" appears (see style.css).
  document.body.classList.toggle('has-misses', missed.length > 0);

  missedCount.textContent = missed.length === 1 ? '1 word' : missed.length + ' words';

  // Rebuild the list from scratch. Cheap at this size, and it means the list
  // can never hold a stale row left over from a previous session.
  missedList.replaceChildren();
  for (const result of missed) {
    missedList.appendChild(missedRow(result.word));
  }
}

/* Build one row of the "review these" list.

   Note this uses createElement and textContent rather than pasting together a
   string of HTML. Assigning text with .textContent means the browser treats
   it as text, always — it can never be interpreted as markup. Our word list is
   ours and harmless, but the habit is what protects you the day some text
   comes from somewhere you don't control. */
function missedRow(word) {
  const row = document.createElement('li');

  const hanzi = document.createElement('span');
  hanzi.className = 'missed__hanzi';
  hanzi.textContent = word.hanzi;

  const gloss = document.createElement('span');
  gloss.className = 'missed__gloss';

  const pinyin = document.createElement('span');
  pinyin.className = 'missed__pinyin';
  pinyin.textContent = word.pinyin;

  const english = document.createElement('span');
  english.className = 'missed__english';
  english.textContent = word.english;

  gloss.append(pinyin, english);
  row.append(hanzi, gloss);
  return row;
}

/* --------------------------------------------------------------------------
   INTERACTION
   None of these touch the screen. They change state and call render().
   -------------------------------------------------------------------------- */

/* Tapping the card flips it either way — so you can hide the answer again to
   take another look before grading yourself. */
function toggleReveal() {
  state.revealed = !state.revealed;
  render();
}

function grade(correct) {
  const item = state.deck[state.index];
  if (!item) return;

  state.results.push({ word: item.word, direction: item.direction, correct: correct });

  // Save after every card, not at the end of the session. Close the tab
  // halfway through and the cards you already graded are still recorded.
  recordResult(item.word.id, item.direction, correct);
  saveProgress();

  state.index += 1;
  state.revealed = false;

  if (state.index >= state.deck.length) {
    state.screen = 'summary';
  }

  render();
}

function startSession() {
  state.deck = buildDeck();
  state.index = 0;
  state.revealed = false;
  state.results = [];

  if (state.deck.length === 0) {
    goHome();
    return;
  }

  state.screen = 'study';
  render();
}

function goHome() {
  state.screen = 'home';
  state.revealed = false;
  document.body.classList.remove('is-revealed', 'dir-en2cn');
  render();
}

/* One listener on the container rather than eight on the inputs. The event
   travels up from whichever input changed, so this keeps working if levels
   are ever added or removed. */
levelsBox.addEventListener('change', function () { readSettings(); render(); });
directionBox.addEventListener('change', readSettings);

startBtn.addEventListener('click', startSession);
card.addEventListener('click', toggleReveal);
missedBtn.addEventListener('click', function () { grade(false); });
gotBtn.addEventListener('click', function () { grade(true); });
againBtn.addEventListener('click', startSession);
homeBtn.addEventListener('click', goHome);

/* --------------------------------------------------------------------------
   START

   The guard matters. If a data file fails to load, there is nothing to study
   and the app would sit there looking merely empty. Saying so plainly beats a
   silent blank screen — you would have no way to tell a bug from a slow
   connection.
   -------------------------------------------------------------------------- */
function boot() {
  if (!window.HSK || Object.keys(window.HSK).length === 0) {
    statWords.textContent = '⚠';
    startBtn.disabled = true;
    document.body.classList.add('screen-home');
    return;
  }

  // Load what was saved last time, before the form is read.
  const savedProgress = readStore(KEY_PROGRESS, null);
  state.progress = (savedProgress && savedProgress.words) || {};

  const savedSettings = readStore(KEY_SETTINGS, null);
  applySettings(savedSettings);

  readSettings();
  goHome();
}

boot();

/* --------------------------------------------------------------------------
   STILL TO COME (Slice 7):
   Keyboard shortcuts, a flip animation, and shorter prompts on EN → 中 cards,
   where the full dictionary definition can be a mouthful.
   -------------------------------------------------------------------------- */
