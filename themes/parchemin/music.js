/* ============================================================
 *  Thème « Parchemin » — musique d'ambiance générée en direct
 *  Petite danse au luth en ré dorien (composition originale)
 *  + crépitement de bougie. Aucun fichier audio nécessaire.
 *  Pour utiliser un vrai fichier à la place : config.js →
 *  music: { src: 'assets/musique.mp3' }
 * ============================================================ */
(function () {
  'use strict';
  const P = window.Platform;
  if (!P) return;

  const BPM = 84, BEAT = 60 / BPM, BAR = 3 * BEAT;
  // [note MIDI, durée en temps] — 8 mesures à 3 temps
  const MELODY = [
    [69, 1], [74, .5], [72, .5], [69, 1],
    [67, 1], [64, .5], [65, .5], [67, 1],
    [69, .5], [71, .5], [72, 1], [69, 1],
    [64, 1.5], [62, .5], [64, 1],
    [65, 1], [69, .5], [72, .5], [74, 1],
    [72, 1], [71, .5], [69, .5], [67, 1],
    [69, .5], [67, .5], [65, .5], [64, .5], [65, .5], [67, .5],
    [62, 3]
  ];
  const ROOTS = [50, 48, 50, 45, 41, 48, 45, 50];
  const hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  function pluck(ctx, out, midi, t, dur, vol) {
    const f = hz(midi);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(4200, f * 7), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.4), t + Math.min(1.4, dur + 0.6));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.6, dur * 1.6));
    lp.connect(g); g.connect(out);
    [['triangle', 0], ['sawtooth', 4]].forEach(function (spec, i) {
      const o = ctx.createOscillator();
      o.type = spec[0]; o.frequency.value = f; o.detune.value = spec[1];
      const og = ctx.createGain(); og.gain.value = i ? 0.25 : 0.8;
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(t + Math.max(0.7, dur * 1.7));
    });
  }

  function crackle(ctx, out, t) {
    const len = Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.012));
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = b;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800 + Math.random() * 2500;
    const g = ctx.createGain(); g.gain.value = 0.05 + Math.random() * 0.12;
    s.connect(hp); hp.connect(g); g.connect(out); s.start(t);
  }

  let timer = null, nextBar = 0, barIndex = 0, nextCrackle = 0, ctxRef = null, outRef = null;

  function scheduleBar(ctx, out, bar, t0) {
    // repère la position de la mesure dans la mélodie
    let beat = 0, idx = 0;
    while (idx < MELODY.length && beat < bar * 3 - 1e-6) { beat += MELODY[idx][1]; idx++; }
    let tb = 0;
    while (idx < MELODY.length && tb < 3 - 1e-6) {
      const n = MELODY[idx];
      const humanize = (Math.random() - 0.5) * 0.015;
      pluck(ctx, out, n[0], t0 + tb * BEAT + humanize, n[1] * BEAT, 0.16);
      tb += n[1]; idx++;
    }
    const r = ROOTS[bar];
    pluck(ctx, out, r, t0, 2 * BEAT, 0.13);
    pluck(ctx, out, r + 7, t0 + BEAT, BEAT, 0.07);
    pluck(ctx, out, r + 12, t0 + 2 * BEAT, BEAT, 0.06);
  }

  function tick() {
    const ctx = ctxRef, out = outRef;
    const ahead = ctx.currentTime + 0.4;
    while (nextBar < ahead) {
      scheduleBar(ctx, out, barIndex % 8, nextBar);
      // une respiration de 2 mesures toutes les 2 boucles
      barIndex++;
      nextBar += BAR;
      if (barIndex % 16 === 0) nextBar += 2 * BAR;
    }
    while (nextCrackle < ahead) {
      crackle(ctx, out, nextCrackle);
      nextCrackle += 0.06 + Math.random() * Math.random() * 0.9;
    }
  }

  P.music.setGenerator({
    start: function (ctx, out) {
      ctxRef = ctx; outRef = out;
      nextBar = ctx.currentTime + 0.3; nextCrackle = ctx.currentTime + 0.1; barIndex = 0;
      tick();
      timer = setInterval(tick, 120);
    },
    stop: function () { clearInterval(timer); timer = null; }
  });
})();
