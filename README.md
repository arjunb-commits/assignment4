# Number Guessing Game and Memory Matching Game

Two linked browser games built with plain HTML, CSS and JavaScript. `index.html` is the entry point (Number Guessing Game) and links to `memory.html` (Memory Matching Game), which links back. There is no build step, no server code, and no data leaves the page.

## Run it

Open `index.html` in a browser. Keep all files together in one folder, including `images/`. No server or internet connection is needed. The project also works on any static host, such as GitHub Pages.

## Project structure

```
index.html        Number Guessing Game (entry point)
guess.js          Guessing game logic (external, event-driven)
memory.html       Memory Matching Game
memory.js         Board, timers, scoring, leaderboard, adaptive difficulty
common.js         Live clock and sound effects (Web Audio tones, no audio files)
style.css         Shared styles
images/           pic01.svg to pic12.svg, 12 distinct card pictures
tests/            run-tests.js, automated tests (jsdom)
```

No page uses `document.write`. Every update is a DOM operation (`textContent`, `createElement`, `classList`, `replaceChildren`).

## Number Guessing Game

The game picks a secret whole number from 1 to 100 inclusive. The page has a number box, a **Guess** button, a live clock, sound effects, and a "Guesses remaining" line.

**Input checks** (`parseGuess`), in order:
1. Trim whitespace; empty input is rejected.
2. The text must match `^\d+$` (digits only). This blocks decimals, signs, exponents such as `1e1`, and letters.
3. The number must be from 1 to 100.

Rejected input shows a red message, plays an error sound, and **does not use a guess**. Every valid guess, **including a repeated one**, uses a guess.

**Feedback and restarts**

| Situation | What happens |
|---|---|
| Valid, wrong guess | "Too high" or "Too low", remaining guesses update, guess added to the history list |
| Correct guess | Reports how many guesses it took, draws a new secret, starts a new game |
| Guess limit used up | Reveals the secret number and starts a new game |

**Dynamic difficulty.** The guess limit starts at 7 and adapts after each game: winning with at most half the limit lowers it by 1 (minimum 5), losing raises it by 1 (maximum 10), and a narrow win leaves it unchanged. The range stays 1 to 100.

## Memory Matching Game

Choose 8, 10 or 12 pairs (16, 20 or 24 cards in a table of 4 rows), a memorize time (Easy 8 s, Medium 5 s, Hard 3 s), and whether adaptive difficulty is on, then press **Start game**.

1. All cards show their pictures during the memorize countdown. Clicks are ignored.
2. Cards flip to numbered backs and the main timer starts: 120 s (8 pairs), 150 s (10 pairs) or 180 s (12 pairs).
3. If the countdown reaches zero, play continues in **overtime** until every pair is matched.
4. The last match stops the timer, fixes the final score, and prompts for a name if the score qualifies for the leaderboard.

Each card is a `<button>` with an `aria-label`, so the board works with a keyboard. Matched cards get a double border and a check mark, so they do not rely on color alone. A click is ignored when the game is not in play, the board is locked (mismatch delay or hint), the card is already matched, or the card is already face up.

### Scoring

`score = 10 x matches - 5 x incorrect attempts - overtime seconds`

An incorrect attempt is two revealed cards that do not match. Overtime seconds are full seconds past the limit (`floor(elapsed - limit)`). The score updates in real time, including the overtime penalty, and can go negative. Time is measured from timestamps, not by counting timer ticks, so it does not drift.

### Leaderboard

| Case | Behavior |
|---|---|
| Storage | Top 5 in `localStorage` (name, score, pairs, timestamp only), highest first |
| Tied scores | The earlier entry ranks higher |
| Tie with 5th place on a full board | Does not qualify |
| Score does not qualify | No prompt is shown |
| Blank or whitespace name | Saved as "Anonymous" |
| Cancelled prompt | Score is not saved, and a message says so |
| Name length | Trimmed and cut to 20 characters |
| Display | Written with `textContent`, so HTML in a name appears as text |
| Corrupt stored data | Ignored; the board starts empty |

### Dynamic difficulty

- **During a game:** after 3 incorrect attempts in a row, one unmatched pair is shown for 1.5 seconds with a dashed border, then hidden. It costs no points, and the streak resets.
- **Between games:** a finish with no overtime and at most a quarter as many mistakes as pairs shortens the next memorize time one step (8, 5, 3 s). Overtime, or as many mistakes as pairs, lengthens it one step. Otherwise it stays the same.

## Tests

`tests/run-tests.js` runs 38 checks headlessly in jsdom against the final files, with a small local web server serving the folder. The tests control the clock and the random numbers, so the 120-second limit and the overtime penalty are tested without waiting. **Result: 38 passed, 0 failed.**

| Area | Cases covered |
|---|---|
| Guess input | Empty, spaces, `abc`, `1.5`, `-3`, `+5`, `0`, `101`, `1e1`, a 21-digit number (all rejected, counter unchanged) |
| Guess counting | Boundaries `1` and `100` count; a repeated guess counts again; remaining guesses are reported |
| Guess restarts | Correct guess starts a new game; running out reveals the secret and restarts |
| Guess difficulty | Easy win lowers the limit; a loss raises it; limit stays between 5 and 10 |
| Board setup | 16, 20 and 24 cards; every image appears exactly twice |
| Memorize phase | Cards face up with clicks ignored, then flip to numbered backs |
| Card rules | Same card twice ignored; mismatch costs 5 points and locks the board; clicks ignored while locked; matched cards ignore clicks |
| Hint | Three misses in a row reveal a pair, then hide it |
| Overtime | 119 s: no overtime; 122.4 s: "OVERTIME +2"; finish with 1 mistake and 2 overtime seconds gives 80 - 5 - 2 = 73; timer frozen after the last match |
| Leaderboard | Saved name trimmed; top 5 descending with earlier-first ties; tie with 5th place does not qualify; blank name becomes "Anonymous"; cancelled prompt not saved; HTML in a name shown as text; corrupt storage handled |
| Memory difficulty | Memorize time moves one step (5 to 3, or 5 to 8) and stays clamped between 3 and 8 |

To re-run the tests, install Node.js, run `npm install jsdom` in the project folder, and then run `node tests/run-tests.js`.

## Development notes

- Rules that can be tested without a screen (`parseGuess`, `judge`, `adjustLimit`, `computeScore`, `insertScore`, `qualifies`, `adaptMemorize`) are small pure functions. The event handlers call them and then update the DOM.
- The memory game exposes injectable `MG.now`, `MG.random` and `MG.promptName`, so tests can move the clock, fix the shuffle, and stub the name prompt.
- My first test run loaded the pages with a fake URL, so the scripts were not found. I changed the tests to serve the folder from a local web server, which is closer to real hosting.
