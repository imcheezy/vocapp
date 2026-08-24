/* ==========================================================================
   生词 — behaviour
   JavaScript is the "verbs" layer: what happens when you interact.

   Slice 1 does exactly one thing: reveal and hide the answer.
   ========================================================================== */

'use strict';   // opts into stricter rules — turns silent typo-bugs into loud errors

/* --------------------------------------------------------------------------
   1. FIND THE ELEMENTS WE NEED
   The HTML already exists by the time this runs (the <script> tag sits at the
   bottom of the page). getElementById looks up the element with id="card".
   -------------------------------------------------------------------------- */
const card = document.getElementById('card');

/* --------------------------------------------------------------------------
   2. THE STATE
   "State" is just the app's memory — the facts it currently believes.
   Right now the app believes exactly one fact, and this is it.

   `let` (not `const`) because this value is allowed to change.
   -------------------------------------------------------------------------- */
let isRevealed = false;

/* --------------------------------------------------------------------------
   3. THE ONE FUNCTION THAT CHANGES ANYTHING

   Note what this does NOT do: it never sets a colour, hides an element, or
   touches a style. It records a fact on <body> and lets CSS draw the
   consequences. That separation is the whole lesson of this slice.

   Everything visual lives in style.css under `body.is-revealed`.
   -------------------------------------------------------------------------- */
function setRevealed(revealed) {
  isRevealed = revealed;

  // classList.toggle(name, true/false) adds the class or removes it.
  document.body.classList.toggle('is-revealed', revealed);

  // Keep the screen-reader description honest about what tapping will do.
  card.setAttribute(
    'aria-label',
    revealed
      ? 'Flashcard showing the answer. Tap to hide it again.'
      : 'Flashcard, tap to reveal the answer.'
  );
}

/* --------------------------------------------------------------------------
   4. LISTEN FOR THE TAP

   addEventListener means: "when this thing happens to this element, run this
   function." It is the foundation of every interactive web page.

   'click' also fires on Enter and Space, because the card is a real <button>.
   That keyboard support is free — but only because of the tag we chose.
   -------------------------------------------------------------------------- */
card.addEventListener('click', function () {
  setRevealed(!isRevealed);   // `!` means "the opposite of" — so this flips it
});

/* --------------------------------------------------------------------------
   5. START IN A KNOWN STATE
   Never assume the page loaded the way you expect. Say so explicitly.
   -------------------------------------------------------------------------- */
setRevealed(false);

/* --------------------------------------------------------------------------
   NOT YET WIRED UP:
   The "Missed it" / "Got it" buttons are visible but do nothing. They need a
   deck of cards to advance through, which arrives in Slice 2, and scoring,
   which arrives in Slice 3. Building them now would mean guessing at code we
   have not designed yet.
   -------------------------------------------------------------------------- */
