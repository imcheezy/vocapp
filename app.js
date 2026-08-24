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
   ELEMENTS
   -------------------------------------------------------------------------- */
const levelsBox    = document.getElementById('levels');
const directionBox = document.getElementById('direction');
const statWords    = document.getElementById('statWords');
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
   BUILDING THE DECK

   A card is no longer just a word — it is a word PLUS the direction you are
   being tested in. Recognising 喜欢 and producing it from "to like" are two
   different things to know, so they are two different cards.

   This shape matters beyond today: Slice 5 stores your progress under
   "word id + direction", so the deck already carries exactly what it needs.
   -------------------------------------------------------------------------- */
function buildDeck() {
  const pool = wordsForLevels(state.settings.levels);

  // Most common first, across every selected level as one pool.
  pool.sort(function (a, b) { return a.freq - b.freq; });

  // Content words before grammar words — see FUNCTION_POS above.
  const isGrammar = function (word) { return FUNCTION_POS.includes(word.pos); };
  const ordered = pool.filter(function (w) { return !isGrammar(w); })
                      .concat(pool.filter(isGrammar));

  return ordered.slice(0, SESSION_SIZE).map(function (word) {
    return { word: word, direction: directionFor() };
  });
}

/* "Mixed" is decided per card, once, when the deck is built — not each time
   the card renders. Deciding at render time would let a card flip direction
   under you the moment anything else redrew the screen. */
function directionFor() {
  if (state.settings.direction === 'mixed') {
    return Math.random() < 0.5 ? 'cn2en' : 'en2cn';
  }
  return state.settings.direction;
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
  const available = wordsForLevels(state.settings.levels).length;

  // toLocaleString puts the thousands separator in: 3181 -> "3,181"
  statWords.textContent = available.toLocaleString();

  // You cannot study nothing. Say why the button is dead rather than leaving
  // someone to poke at it.
  const none = state.settings.levels.length === 0;
  document.body.classList.toggle('no-levels', none);
  startBtn.disabled = none;
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

  readSettings();
  goHome();
}

boot();

/* --------------------------------------------------------------------------
   NOT YET BUILT:
   Nothing is remembered when you close the tab — your levels, your direction
   and everything you have learned reset (Slice 5). Every session starts from
   the same words because there is no scheduling yet (Slice 6).
   -------------------------------------------------------------------------- */
