// Shared helpers for both pages: sound effects (Web Audio, no asset files) and a live clock.
(function () {
  var ctx = null, muted = false;
  // Each sound is a list of [frequency Hz, duration s, wave type, start delay s].
  var SOUNDS = {
    flip:  [[600, 0.07, "square", 0]],
    good:  [[523, 0.12, "sine", 0], [659, 0.12, "sine", 0.12], [784, 0.18, "sine", 0.24]],
    bad:   [[220, 0.25, "sawtooth", 0]],
    error: [[140, 0.18, "square", 0], [140, 0.18, "square", 0.22]],
    win:   [[523, 0.15, "triangle", 0], [659, 0.15, "triangle", 0.15], [784, 0.15, "triangle", 0.3], [1047, 0.35, "triangle", 0.45]],
    lose:  [[392, 0.2, "sawtooth", 0], [330, 0.2, "sawtooth", 0.2], [262, 0.4, "sawtooth", 0.4]],
    hint:  [[880, 0.1, "sine", 0], [880, 0.1, "sine", 0.15]]
  };
  function tone(freq, dur, type, delay) {
    var t = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur);
  }
  window.Sound = {
    play: function (name) {
      if (muted || !SOUNDS[name]) return;
      try { // the AudioContext is created lazily, inside a user gesture, to satisfy autoplay rules
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        SOUNDS[name].forEach(function (n) { tone(n[0], n[1], n[2], n[3]); });
      } catch (e) { /* no audio support: the game still works silently */ }
    },
    toggle: function () { muted = !muted; return muted; }
  };
  window.addEventListener("DOMContentLoaded", function () {
    var clock = document.getElementById("clock");
    if (clock) {
      var update = function () { clock.textContent = new Date().toLocaleTimeString(); };
      update(); setInterval(update, 1000);
    }
    var mute = document.getElementById("muteBtn");
    if (mute) mute.addEventListener("click", function () {
      var m = window.Sound.toggle();
      mute.textContent = m ? "Sound: off" : "Sound: on";
      mute.setAttribute("aria-pressed", String(m));
    });
  });
})();
