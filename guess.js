// Number Guessing Game: event-driven; the page changes only through DOM updates.
(function () {
  "use strict";
  var MIN = 1, MAX = 100;                         // secret range, inclusive
  var START_LIMIT = 7, MIN_LIMIT = 5, MAX_LIMIT = 10; // allowed guesses per game (7 = enough for binary search)
  var game = { secret: 0, limit: START_LIMIT, used: 0 };

  // ---- Pure logic (also used by the tests) ----
  function newSecret() { return Math.floor(Math.random() * (MAX - MIN + 1)) + MIN; }

  // Range check: text -> {ok, value} or {ok:false, error}. Invalid input never reaches the guess counter.
  function parseGuess(text) {
    var t = String(text).trim();
    if (t === "") return { ok: false, error: "Enter a number first." };
    if (!/^\d+$/.test(t)) return { ok: false, error: "Enter a whole number using digits only (no decimals, signs, or letters)." };
    var n = parseInt(t, 10);
    if (n < MIN || n > MAX) return { ok: false, error: "Out of range: choose a number from " + MIN + " to " + MAX + "." };
    return { ok: true, value: n };
  }

  function judge(guess, secret) { return guess === secret ? "correct" : (guess > secret ? "high" : "low"); }

  // Dynamic difficulty: tune the guess limit from recent accuracy (how much of the limit was used).
  function adjustLimit(limit, won, used) {
    if (won && used <= Math.ceil(limit / 2)) return Math.max(MIN_LIMIT, limit - 1); // won easily: harder
    if (!won) return Math.min(MAX_LIMIT, limit + 1);                               // lost: easier
    return limit;                                                                  // narrow win: unchanged
  }

  // ---- UI ----
  var el = {};
  function setMessage(text, cls) { el.message.textContent = text; el.message.className = cls || ""; }
  function render() {
    el.remaining.textContent = "Guesses remaining: " + (game.limit - game.used) + " of " + game.limit;
    el.difficulty.textContent = "Difficulty: " + game.limit + " guesses allowed per game (adjusts to how you play).";
  }
  function newGame() {
    game.secret = newSecret(); game.used = 0;
    el.history.replaceChildren();
    render();
  }

  // One submitted guess. Returns a result object so the tests can check outcomes without the UI text.
  function submitGuess(text) {
    var parsed = parseGuess(text);
    if (!parsed.ok) { setMessage(parsed.error, "error"); Sound.play("error"); return { counted: false, error: parsed.error }; }

    game.used++;                                   // every valid guess counts, even a repeat
    var g = parsed.value, verdict = judge(g, game.secret);
    var item = document.createElement("li");
    item.textContent = g + ": " + (verdict === "correct" ? "correct" : "too " + verdict);
    el.history.appendChild(item);

    if (verdict === "correct") {
      var used = game.used;
      game.limit = adjustLimit(game.limit, true, used);
      newGame();
      setMessage("Correct! You got it in " + used + (used === 1 ? " guess" : " guesses") + ". A new game has started.", "good");
      Sound.play("win");
      return { counted: true, verdict: "correct", restarted: true };
    }
    if (game.used >= game.limit) {
      var secret = game.secret;
      game.limit = adjustLimit(game.limit, false, game.used);
      newGame();
      setMessage("Out of guesses! The secret number was " + secret + ". A new game has started.");
      Sound.play("lose");
      return { counted: true, verdict: verdict, restarted: true, revealed: secret };
    }
    render();
    setMessage("Too " + verdict + ". Try a " + (verdict === "high" ? "lower" : "higher") + " number.");
    Sound.play("hint");
    return { counted: true, verdict: verdict, restarted: false };
  }

  window.addEventListener("DOMContentLoaded", function () {
    ["guessForm", "guessInput", "remaining", "message", "difficulty", "history"].forEach(function (id) { el[id] = document.getElementById(id); });
    el.guessForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var result = submitGuess(el.guessInput.value);
      if (result.counted) el.guessInput.value = ""; // keep the text after an invalid entry so it can be fixed
      el.guessInput.focus();
    });
    newGame();
    setMessage("Type a guess and press Guess.");
  });

  window.GuessGame = { parseGuess: parseGuess, judge: judge, adjustLimit: adjustLimit, submitGuess: submitGuess,
    state: game, setSecret: function (n) { game.secret = n; } };
})();
