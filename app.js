/* ==========================================================================
   生词 — behaviour

   Slice 2: flip through a real deck of HSK words.

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
   Values you might reasonably want to change, gathered in one place instead
   of buried as unexplained numbers deep in the logic.
   -------------------------------------------------------------------------- */
const SESSION_SIZE = 20;   // cards per session
const LEVELS = [1];        // which HSK levels to draw from (Slice 4 makes this a choice)

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

/* --------------------------------------------------------------------------
   THE STATE

   In Slice 1 the app remembered one thing. Now it remembers three, so they
   live together in a single object rather than as loose variables.

   This matters more than it looks. `state` is now the ONLY place the app
   stores what is true. Every pixel on screen is derived from it by render()
   below. If you ever want to know what the app believes, you look here — one
   object, not five variables scattered across the file.
   -------------------------------------------------------------------------- */
const state = {
  deck: [],        // the words in this session, in order
  index: 0,        // which one we're on
  revealed: false, // is the answer showing?
};

/* --------------------------------------------------------------------------
   BUILDING THE DECK
   -------------------------------------------------------------------------- */
function buildDeck() {
  // Gather every word from the levels we're studying.
  let pool = [];
  for (const level of LEVELS) {
    const words = window.HSK && window.HSK[level];
    if (words) {
      pool = pool.concat(words);
    }
  }

  // The word lists arrive sorted by frequency — most common first. Taking
  // from the top means you learn 好 and people before you meet rare words.
  // Slice 6 replaces this with proper spaced-repetition scheduling.
  return pool.slice(0, SESSION_SIZE);
}

/* --------------------------------------------------------------------------
   RENDER — THE ONE FUNCTION THAT TOUCHES THE SCREEN

   This is the biggest idea in the slice, and the pattern the rest of the app
   will be built on.

   render() reads `state` and makes the screen match it. Nothing else in this
   file is allowed to change what you see. So the whole app becomes:

       change state  ->  call render()

   The alternative — every function nudging a few elements as it goes — is how
   UIs end up in impossible states, where the progress bar says card 7 and the
   card says something else, because two bits of code each updated half of it.
   Here that cannot happen: there is one description of the screen, and it is
   regenerated from scratch every time.

   This is, in miniature, exactly what React and every other UI framework does.
   -------------------------------------------------------------------------- */
function render() {
  const word = state.deck[state.index];
  if (!word) return;

  // Front
  frontHanzi.textContent = word.hanzi;

  // Back
  backHanzi.textContent   = word.hanzi;
  backPinyin.textContent  = word.pinyin;
  backEnglish.textContent = word.english;
  backPos.textContent     = word.pos;
  backPos.hidden          = !word.pos;   // some words have no useful label

  // Which side is showing (Slice 1's single fact, still doing its job)
  document.body.classList.toggle('is-revealed', state.revealed);

  // The tray
  hint.textContent = state.revealed ? 'tap for the next word' : 'tap to reveal';

  // The progress bar
  const done = state.revealed ? state.index + 1 : state.index;
  progressFill.style.width = (done / state.deck.length * 100) + '%';

  // Keep the spoken description accurate — a screen-reader user should hear
  // where they are, not just "button".
  card.setAttribute('aria-label', state.revealed
    ? `${word.hanzi}, ${word.pinyin}, ${word.english}. Card ${state.index + 1} of ${state.deck.length}. Tap for the next word.`
    : `Card ${state.index + 1} of ${state.deck.length}. Tap to reveal the answer.`);
}

/* --------------------------------------------------------------------------
   INTERACTION
   Tapping does one of two things depending on which side you're looking at.
   Note that neither branch touches the screen directly — they change state,
   then hand off to render().
   -------------------------------------------------------------------------- */
function advance() {
  if (!state.revealed) {
    state.revealed = true;            // front -> back
  } else {
    // Back -> next card. The % wraps around to 0 at the end of the deck.
    // Slice 3 replaces this with a proper session summary.
    state.index = (state.index + 1) % state.deck.length;
    state.revealed = false;
  }
  render();
}

card.addEventListener('click', advance);

/* --------------------------------------------------------------------------
   START

   The guard matters. If a data file fails to load, the deck is empty and the
   app would sit there blank with no explanation. Saying so plainly beats a
   silent white screen — you would have no way to tell a bug from a slow
   connection.
   -------------------------------------------------------------------------- */
function start() {
  state.deck = buildDeck();
  state.index = 0;
  state.revealed = false;

  if (state.deck.length === 0) {
    frontHanzi.textContent = '⚠';
    hint.textContent = 'Word lists failed to load — check the data/ folder.';
    return;
  }

  render();
}

start();

/* --------------------------------------------------------------------------
   NOT YET WIRED UP:
   The "Missed it" / "Got it" buttons exist in index.html but stay hidden —
   they need scoring, which is Slice 3. At the end of the deck the session
   wraps back to the first card; Slice 3 replaces that with a summary screen.
   -------------------------------------------------------------------------- */
