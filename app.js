/* ==========================================================================
   生词 — behaviour

   Slice 3: grade each card, then see how the session went.

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
const SESSION_SIZE = 20;   // cards per session
const LEVELS = [1];        // which HSK levels to draw from (Slice 4 makes this a choice)

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
const card         = document.getElementById('card');
const frontHanzi   = document.getElementById('frontHanzi');
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

/* --------------------------------------------------------------------------
   THE STATE

   Still one object, still the only place the app stores what is true.
   Two things are new: which screen we're on, and what happened to each card.

   `results` is deliberately NOT stored inside the deck. A card is a word; a
   result is something that happened to a word during one session. Keeping
   them apart is the same instinct as keeping the word list separate from your
   long-term progress — which is exactly what Slice 5 will need.
   -------------------------------------------------------------------------- */
const state = {
  screen: 'study',   // 'study' | 'summary'
  deck: [],          // the words in this session, in order
  index: 0,          // which one we're on
  revealed: false,   // is the answer showing?
  results: [],       // one entry per graded card: { word, correct }
};

/* --------------------------------------------------------------------------
   BUILDING THE DECK
   -------------------------------------------------------------------------- */
function buildDeck() {
  let pool = [];
  for (const level of LEVELS) {
    const words = window.HSK && window.HSK[level];
    if (words) {
      pool = pool.concat(words);
    }
  }

  // Most common first. (Each level arrives sorted, but once several levels are
  // combined in Slice 4 they need sorting as one pool.)
  pool.sort(function (a, b) { return a.freq - b.freq; });

  // Content words first, grammar words after — see FUNCTION_POS above.
  const isGrammar = function (word) { return FUNCTION_POS.includes(word.pos); };
  const content = pool.filter(function (w) { return !isGrammar(w); });
  const grammar = pool.filter(isGrammar);

  return content.concat(grammar).slice(0, SESSION_SIZE);
}

/* --------------------------------------------------------------------------
   RENDER — THE ONE FUNCTION THAT TOUCHES THE SCREEN

   render() reads `state` and makes the screen match it. Nothing else in this
   file writes to the page. So the whole app is:

       change state  ->  call render()

   As the app grew a second screen, render() split into two helpers rather
   than becoming one long function with a big if. Same principle, one more
   level: each helper owns one screen, and neither knows the other exists.
   -------------------------------------------------------------------------- */
function render() {
  document.body.classList.toggle('screen-study',   state.screen === 'study');
  document.body.classList.toggle('screen-summary', state.screen === 'summary');

  if (state.screen === 'study') {
    renderStudy();
  } else {
    renderSummary();
  }
}

function renderStudy() {
  const word = state.deck[state.index];
  if (!word) return;

  frontHanzi.textContent = word.hanzi;

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

  card.setAttribute('aria-label', state.revealed
    ? `${word.hanzi}, ${word.pinyin}, ${word.english}. Card ${state.index + 1} of ${state.deck.length}. Grade it below, or tap to hide the answer.`
    : `Card ${state.index + 1} of ${state.deck.length}. Tap to reveal the answer.`);
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
   take another look at the character before grading yourself. */
function toggleReveal() {
  state.revealed = !state.revealed;
  render();
}

function grade(correct) {
  const word = state.deck[state.index];
  if (!word) return;

  state.results.push({ word: word, correct: correct });
  state.index += 1;
  state.revealed = false;

  if (state.index >= state.deck.length) {
    state.screen = 'summary';
  }

  render();
}

card.addEventListener('click', toggleReveal);
missedBtn.addEventListener('click', function () { grade(false); });
gotBtn.addEventListener('click', function () { grade(true); });
againBtn.addEventListener('click', start);

/* --------------------------------------------------------------------------
   START

   The guard matters. If a data file fails to load, the deck is empty and the
   app would sit there blank with no explanation. Saying so plainly beats a
   silent white screen — you would have no way to tell a bug from a slow
   connection.
   -------------------------------------------------------------------------- */
function start() {
  state.screen = 'study';
  state.deck = buildDeck();
  state.index = 0;
  state.revealed = false;
  state.results = [];

  if (state.deck.length === 0) {
    frontHanzi.textContent = '⚠';
    hint.textContent = 'Word lists failed to load — check the data/ folder.';
    return;
  }

  render();
}

start();

/* --------------------------------------------------------------------------
   NOT YET BUILT:
   Levels and direction are fixed (Slice 4). Nothing is remembered when you
   close the tab (Slice 5). Every session starts from the same 20 words
   because there is no scheduling yet (Slice 6).
   -------------------------------------------------------------------------- */
