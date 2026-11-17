// Memory Matching Game. Event-driven; all page changes are DOM updates.
(function () {
  "use strict";
  var NAMES = ["Red circle", "Blue square", "Green triangle", "Yellow star", "Pink heart", "Purple diamond",
               "Orange hexagon", "Teal moon", "Brown cross", "Gold bolt", "Lime leaf", "Navy drop"];
  var LIMITS = { 8: 120, 10: 150, 12: 180 };   // seconds before overtime, by pair count
  var COLS = { 8: 4, 10: 5, 12: 6 };           // 16 / 20 / 24 cards, always 4 rows
  var MEMORIZE_STEPS = [8, 5, 3];              // easy -> hard memorization seconds
  var BOARD_KEY = "memoryMatchLeaderboard", BOARD_SIZE = 5, NAME_MAX = 20;
  var POINTS_MATCH = 10, POINTS_MISS = 5, MISS_STREAK_FOR_HINT = 3;

  // Injectable so the tests can control time, randomness, and the name prompt.
  var MG = {
    now: function () { return Date.now(); },
    random: Math.random,
    promptName: function (msg) { return window.prompt(msg, ""); }
  };

  var s = { phase: "idle", pairs: 8, limit: 120, cards: [], selected: [], lock: false,
            matches: 0, mistakes: 0, streak: 0, memEnd: 0, playStart: 0, finalScore: null, overtimeSec: 0 };
  var timers = { tick: null, mismatch: null, hint: null };
  var el = {};

  /* ---------- Pure logic ---------- */
  function computeScore(matches, mistakes, overtimeSec) {
    return matches * POINTS_MATCH - mistakes * POINTS_MISS - overtimeSec;
  }
  function shuffle(arr) { // Fisher-Yates
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(MG.random() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // Tie rule: higher score first; on equal scores the EARLIER entry ranks higher.
  function insertScore(list, entry) {
    return list.concat([entry]).sort(function (a, b) { return b.score - a.score || a.ts - b.ts; }).slice(0, BOARD_SIZE);
  }
  // A score qualifies if the board has room, or it strictly beats 5th place
  // (a tie with 5th place loses to the earlier entry, consistent with insertScore).
  function qualifies(list, score) { return list.length < BOARD_SIZE || score > list[list.length - 1].score; }
  // Adaptive memorize time: strong game -> shorter, weak game -> longer (one step, clamped to 3..8 s).
  function adaptMemorize(current, pairs, mistakes, overtimeSec) {
    var i = Math.max(0, MEMORIZE_STEPS.indexOf(current));
    if (overtimeSec === 0 && mistakes <= Math.floor(pairs / 4)) i = Math.min(MEMORIZE_STEPS.length - 1, i + 1);
    else if (overtimeSec > 0 || mistakes >= pairs) i = Math.max(0, i - 1);
    return MEMORIZE_STEPS[i];
  }

  /* ---------- Leaderboard persistence (scores and names only; no secrets) ---------- */
  function loadBoard() {
    try {
      var list = JSON.parse(localStorage.getItem(BOARD_KEY) || "[]");
      if (!Array.isArray(list)) return [];
      return list.filter(function (e) { return e && typeof e.score === "number" && typeof e.name === "string" && typeof e.ts === "number"; })
                 .sort(function (a, b) { return b.score - a.score || a.ts - b.ts; }).slice(0, BOARD_SIZE);
    } catch (e) { return []; }
  }
  function saveBoard(list) { try { localStorage.setItem(BOARD_KEY, JSON.stringify(list)); } catch (e) { /* storage blocked: keep playing */ } }
  function renderBoard() {
    var list = loadBoard();
    el.leaderboard.replaceChildren();
    if (!list.length) { var li = document.createElement("li"); li.textContent = "No scores yet."; el.leaderboard.appendChild(li); return; }
    list.forEach(function (e) {
      var item = document.createElement("li");
      item.textContent = e.name + ": " + e.score + " points (" + e.pairs + " pairs)"; // textContent: names are never parsed as HTML
      el.leaderboard.appendChild(item);
    });
  }
  // Prompt at game end. Cancel -> not saved. Blank -> "Anonymous". Non-qualifying scores are never prompted.
  function recordScore(score) {
    var list = loadBoard();
    if (!qualifies(list, score)) return "Score " + score + " did not reach the top " + BOARD_SIZE + ".";
    var name = MG.promptName("New high score: " + score + "! Enter your name:");
    if (name === null) return "Name entry cancelled: score not saved.";
    name = name.trim().slice(0, NAME_MAX) || "Anonymous";
    saveBoard(insertScore(list, { name: name, score: score, pairs: s.pairs, ts: MG.now() }));
    renderBoard();
    return "Saved to the leaderboard as " + name + ".";
  }

  /* ---------- Cards ---------- */
  function setFace(card, up) {
    card.faceUp = up;
    card.el.classList.toggle("up", up);
    card.el.setAttribute("aria-label", "Card " + (card.index + 1) + (up ? ": " + NAMES[card.id] : ", face down") + (card.matched ? ", matched" : ""));
  }
  function buildBoard() {
    var ids = [];
    for (var p = 0; p < s.pairs; p++) ids.push(p, p);
    shuffle(ids);
    s.cards = ids.map(function (id, index) { return { id: id, index: index, faceUp: false, matched: false, el: null }; });
    var cols = COLS[s.pairs], tbody = document.createElement("tbody"), row;
    s.cards.forEach(function (card, i) {
      if (i % cols === 0) { row = document.createElement("tr"); tbody.appendChild(row); }
      var td = document.createElement("td"), btn = document.createElement("button");
      btn.type = "button"; btn.className = "card";
      var num = document.createElement("span"); num.className = "num"; num.textContent = i + 1;
      var img = document.createElement("img"); img.className = "pic"; img.alt = ""; // label comes from aria-label
      img.src = "images/pic" + String(id2file(card.id)) + ".svg";
      btn.append(num, img);
      btn.addEventListener("click", function () { clickCard(i); });
      card.el = btn; td.appendChild(btn); row.appendChild(td);
      setFace(card, true); // shown face-up for the memorization period
    });
    el.board.replaceChildren(tbody);
  }
  function id2file(id) { return (id < 9 ? "0" : "") + (id + 1); }

  /* ---------- Game flow ---------- */
  function clearTimers() {
    clearInterval(timers.tick); clearTimeout(timers.mismatch); clearTimeout(timers.hint);
    timers.tick = timers.mismatch = timers.hint = null;
  }
  function startGame() {
    clearTimers();
    s.pairs = parseInt(el.pairs.value, 10); s.limit = LIMITS[s.pairs];
    var memorize = parseInt(el.memorize.value, 10);
    s.selected = []; s.lock = false; s.matches = 0; s.mistakes = 0; s.streak = 0;
    s.finalScore = null; s.overtimeSec = 0; s.phase = "memorize";
    s.memEnd = MG.now() + memorize * 1000;
    buildBoard();
    el.result.textContent = "";
    el.startBtn.textContent = "Restart game";
    updateStats();
    timers.tick = setInterval(tick, 200);
    tick();
  }
  function beginPlay() {
    s.cards.forEach(function (c) { setFace(c, false); }); // flip back to numbered backs
    s.phase = "play"; s.playStart = MG.now();
    el.status.textContent = "Go! Find all " + s.pairs + " pairs.";
  }
  function elapsedSec() { return (MG.now() - s.playStart) / 1000; }
  function overtimeSeconds() { return Math.max(0, Math.floor(elapsedSec() - s.limit)); } // full seconds past the limit

  function tick() {
    if (s.phase === "memorize") {
      var left = Math.max(0, Math.ceil((s.memEnd - MG.now()) / 1000));
      el.timer.textContent = "Memorize: " + left + " s";
      el.status.textContent = "Memorize the card positions! Cards hide in " + left + " s.";
      if (MG.now() >= s.memEnd) beginPlay();
    }
    if (s.phase === "play") {
      var remaining = s.limit - elapsedSec();
      if (remaining > 0) { el.timer.textContent = "Time left: " + Math.ceil(remaining) + " s"; el.timer.classList.remove("overtime"); }
      else { el.timer.textContent = "OVERTIME +" + overtimeSeconds() + " s (-1 point per second)"; el.timer.classList.add("overtime"); }
      updateStats();
    }
  }
  function currentScore() { return computeScore(s.matches, s.mistakes, s.phase === "play" ? overtimeSeconds() : s.overtimeSec); }
  function updateStats() {
    el.score.textContent = "Score: " + (s.phase === "done" ? s.finalScore : currentScore());
    el.matches.textContent = "Matches: " + s.matches + "/" + s.pairs;
    el.mistakes.textContent = "Mistakes: " + s.mistakes;
  }

  function clickCard(i) {
    var card = s.cards[i];
    // Ignore: not in play, board locked, already matched, or the same face-up card chosen twice.
    if (s.phase !== "play" || s.lock || card.matched || card.faceUp) return;
    setFace(card, true); Sound.play("flip");
    s.selected.push(card);
    if (s.selected.length < 2) return;

    var a = s.selected[0], b = s.selected[1];
    if (a.id === b.id) {
      a.matched = b.matched = true;
      [a, b].forEach(function (c) { c.el.classList.add("matched"); setFace(c, true); });
      s.matches++; s.streak = 0; s.selected = [];
      Sound.play("good");
      el.status.textContent = "Match! +" + POINTS_MATCH + " points.";
      updateStats();
      if (s.matches === s.pairs) finishGame();
    } else {
      s.mistakes++; s.streak++; s.lock = true;
      Sound.play("bad");
      el.status.textContent = "Not a match: -" + POINTS_MISS + " points.";
      updateStats();
      timers.mismatch = setTimeout(hideMismatch, 800);
    }
  }
  function hideMismatch() {
    s.selected.forEach(function (c) { setFace(c, false); });
    s.selected = []; s.lock = false;
    if (s.streak >= MISS_STREAK_FOR_HINT) giveHint();
  }
  // Real-time adaptation: after 3 misses in a row, briefly reveal one unmatched pair (no point cost).
  function giveHint() {
    var open = s.cards.filter(function (c) { return !c.matched; });
    var id = open[Math.floor(MG.random() * open.length)].id;
    s.hintCards = open.filter(function (c) { return c.id === id; });
    s.hintCards.forEach(function (c) { setFace(c, true); c.el.classList.add("hint"); });
    s.lock = true; s.streak = 0;
    Sound.play("hint");
    el.status.textContent = "Hint: remember this pair!";
    timers.hint = setTimeout(endHint, 1500);
  }
  function endHint() {
    (s.hintCards || []).forEach(function (c) { c.el.classList.remove("hint"); if (!c.matched) setFace(c, false); });
    s.hintCards = []; s.lock = false;
  }

  function finishGame() {
    clearInterval(timers.tick);
    s.overtimeSec = overtimeSeconds();
    s.finalScore = computeScore(s.matches, s.mistakes, s.overtimeSec);
    s.phase = "done";
    updateStats();
    el.timer.textContent = "Finished in " + Math.floor(elapsedSec()) + " s" + (s.overtimeSec ? " (" + s.overtimeSec + " s overtime)" : "");
    var text = "All pairs matched! Final score: " + s.finalScore + " (" + s.matches + " matches x 10, " + s.mistakes +
               " mistakes x -5, " + s.overtimeSec + " overtime seconds x -1).";
    // Dynamic difficulty: tune the NEXT game's memorize time from this game's performance.
    if (el.adaptive.checked) {
      var before = parseInt(el.memorize.value, 10), next = adaptMemorize(before, s.pairs, s.mistakes, s.overtimeSec);
      el.memorize.value = String(next);
      text += next === before ? " Adaptive: memorize time stays at " + next + " s."
                              : " Adaptive: memorize time " + (next < before ? "shortened" : "lengthened") + " to " + next + " s for the next game.";
    }
    el.result.textContent = text;
    Sound.play("win");
    // Defer the prompt so the board and final score paint before the blocking dialog appears.
    setTimeout(function () { el.result.textContent = text + " " + recordScore(s.finalScore); }, 50);
  }

  window.addEventListener("DOMContentLoaded", function () {
    ["pairs", "memorize", "adaptive", "startBtn", "score", "matches", "mistakes", "timer", "status", "board", "result", "leaderboard", "clearBoard"]
      .forEach(function (id) { el[id] = document.getElementById(id); });
    el.startBtn.addEventListener("click", startGame);
    el.clearBoard.addEventListener("click", function () { saveBoard([]); renderBoard(); });
    renderBoard();
  });

  MG.state = s; MG.startGame = startGame; MG.tick = tick; MG.clickCard = clickCard; MG.hideMismatch = hideMismatch; MG.endHint = endHint;
  MG.computeScore = computeScore; MG.insertScore = insertScore; MG.qualifies = qualifies; MG.adaptMemorize = adaptMemorize;
  MG.loadBoard = loadBoard; MG.recordScore = recordScore; MG.overtimeSeconds = overtimeSeconds;
  window.MG = MG;
})();
