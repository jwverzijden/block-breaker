/*
 * Tiny WebAudio synth for sound effects. No assets required.
 * Everything is generated on the fly; a mute flag is persisted separately.
 */
(function () {
  'use strict';

  let ctx = null;
  let muted = false;
  let duck = 1;                 // per-call volume scale (ducked when a sound overlaps itself)
  const active = {};            // soundName -> number of currently-sounding voices
  const RELEASE = {             // ms a sound keeps counting as "active" (approx. its full length)
    swing: 150, break: 150, buy: 260, deny: 220, levelup: 600, zap: 150, burn: 120, boom: 220
  };

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol * duck, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, when) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol * duck, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t0);
  }

  const SOUNDS = {
    swing() {
      noise(0.08, 0.25);
      tone(180, 0.09, 'triangle', 0.12, 0, 90);
    },
    break() {
      // soft "plop" — a short sine blip that drops in pitch (no snare-like noise burst)
      tone(420, 0.09, 'sine', 0.05, 0, 150);
    },
    buy() {
      tone(523, 0.09, 'sine', 0.18, 0);
      tone(784, 0.12, 'sine', 0.18, 0.08);
    },
    deny() {
      tone(160, 0.12, 'square', 0.12, 0, 110);
    },
    levelup() {
      tone(392, 0.12, 'sine', 0.16, 0);
      tone(523, 0.12, 'sine', 0.16, 0.12);
      tone(659, 0.16, 'sine', 0.16, 0.24);
      tone(784, 0.2, 'sine', 0.16, 0.36);
    },
    zap() {
      noise(0.07, 0.22);
      tone(1400, 0.08, 'sawtooth', 0.10, 0, 200);
    },
    burn() {
      noise(0.06, 0.10);
    },
    boom() {
      noise(0.01, 0.10);
      tone(120, 0.22, 'sine', 0.06, 0, 45);
    }
  };

  window.GameAudio = {
    play(name) {
      const fn = SOUNDS[name];
      if (!fn || muted) return;
      const overlap = active[name] || 0;
      active[name] = overlap + 1;
      // Each overlapping voice of the same sound is quieter, so rapid repeats
      // (e.g. many blocks breaking at once) don't stack into a harsh burst.
      const prev = duck;
      duck = overlap === 0 ? 1 : 1 / (1 + overlap * 0.6);
      fn();
      duck = prev;
      setTimeout(function () {
        if (active[name] > 0) active[name]--;
      }, RELEASE[name] || 300);
    },
    setMuted(m) { muted = !!m; },
    isMuted() { return muted; },
    // call on a user gesture so the context is unlocked early
    unlock() { ensureCtx(); }
  };
})();
