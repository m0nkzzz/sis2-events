/* ============================================================
 *  Thème « Parchemin » — moteur audio
 *  Tout est synthétisé en direct (aucun fichier) :
 *  - musique : luth (Karplus-Strong), basse, bourdon de vielle,
 *    petite réverbe de pièce en pierre ;
 *  - ambiance : crépitement de la bougie ;
 *  - bruitages : papier, plume, encre, bougie, feu, cire, pigeon.
 *  Un fichier audio peut remplacer la musique : config.js →
 *  music: { src: 'assets/musique.mp3' }
 * ============================================================ */
(function () {
  'use strict';
  const P = window.Platform;
  if (!P) return;

  /* ---------- infrastructure ---------- */
  let ctx = null, bus = null, rev = null, revSend = null;
  const noiseCache = {};
  const loops = {};

  function ready() {
    if (P.music.muted) return null;
    ctx = P.audioCtx();
    if (!ctx) return null;
    if (!bus) build();
    return ctx;
  }

  function build() {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    bus = ctx.createGain(); bus.gain.value = 0.9;
    bus.connect(comp); comp.connect(ctx.destination);
    rev = ctx.createConvolver(); rev.buffer = impulse(2.2, 2.8);
    revSend = ctx.createGain(); revSend.gain.value = 0.22;
    revSend.connect(rev); rev.connect(bus);
  }

  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // premières réflexions + queue diffuse
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 1200 ? (Math.random() < 0.02 ? 1 : 0.2) : 1);
      }
    }
    return b;
  }

  function noise(kind) {
    if (noiseCache[kind]) return noiseCache[kind];
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
      } else d[i] = w;
    }
    return (noiseCache[kind] = b);
  }

  /** Bruit filtré avec enveloppe — la brique de base de presque tous les bruitages. */
  function burst(o) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = noise(o.noise || 'white');
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || o.dur));
    const g = c.createGain();
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + a);
    if (o.hold) g.gain.setValueAtTime(o.vol || 0.2, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(bus);
    if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(revSend); }
    src.start(t, Math.random() * 2); src.stop(t + o.dur + 0.05);
  }

  /** Son tonal court (gouttes, verre, voix du pigeon…). */
  function tone(o) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || o.dur));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = osc;
    if (o.filter) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.filter; f.Q.value = o.q || 2; osc.connect(f); node = f; }
    node.connect(g); g.connect(bus);
    if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(revSend); }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  /** Boucles continues pilotées par une intensité 0..1 (frottement de papier, vent, feu). */
  function loop(name, level) {
    const c = ready();
    if (!c) { if (loops[name]) loops[name].g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); return; }
    let L = loops[name];
    if (!L) {
      const spec = {
        slide: { noise: 'pink', type: 'bandpass', f: 2600, q: 0.6, max: 0.22 },
        wind: { noise: 'brown', type: 'lowpass', f: 500, q: 0.7, max: 0.5 },
        fire: { noise: 'brown', type: 'lowpass', f: 900, q: 0.5, max: 0.35 },
        crackle: { noise: 'pink', type: 'highpass', f: 3500, q: 0.5, max: 0 }
      }[name];
      const src = c.createBufferSource(); src.buffer = noise(spec.noise); src.loop = true;
      const f = c.createBiquadFilter(); f.type = spec.type; f.frequency.value = spec.f; f.Q.value = spec.q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(bus); src.start();
      L = loops[name] = { g: g, f: f, max: spec.max, base: spec.f };
    }
    L.g.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * L.max, c.currentTime, 0.06);
    if (name === 'slide') L.f.frequency.setTargetAtTime(L.base * (0.7 + level * 0.8), c.currentTime, 0.05);
    return L;
  }

  /* ---------- bruitages ---------- */
  const R = Math.random;
  const sfx = {
    paperGrab() {
      for (let i = 0; i < 4; i++) burst({ f: 1800 + R() * 2600, q: 0.9, dur: 0.05 + R() * 0.07, vol: 0.12 + R() * 0.08, delay: i * (0.02 + R() * 0.04), noise: 'pink' });
      burst({ type: 'lowpass', f: 380, dur: 0.12, vol: 0.18, noise: 'pink' });
    },
    paperDrop() {
      burst({ type: 'lowpass', f: 260, q: 0.7, dur: 0.16, vol: 0.32, noise: 'pink' });
      burst({ f: 2200, q: 0.7, dur: 0.18, vol: 0.06, delay: 0.02, noise: 'pink' });
    },
    crease(n) {
      for (let i = 0; i < (n || 7); i++) burst({ type: 'highpass', f: 2500 + R() * 3000, q: 0.7, dur: 0.012 + R() * 0.02, vol: 0.12 + R() * 0.12, delay: i * 0.018 + R() * 0.02 });
      burst({ f: 900, q: 1, dur: 0.22, vol: 0.06, noise: 'pink', delay: 0.04 });
    },
    whoosh(dur) {
      dur = dur || 0.9;
      burst({ f: 380, f2: 1600, sweep: dur * 0.45, q: 1.4, dur: dur, attack: dur * 0.35, vol: 0.2, noise: 'pink', wet: 0.4 });
    },
    quillOut() {
      tone({ f: 1100, f2: 380, dur: 0.09, vol: 0.12 });
      tone({ f: 760, f2: 300, dur: 0.07, vol: 0.07, delay: 0.07 });
      tone({ f: 2640, dur: 0.45, vol: 0.025, delay: 0.03, wet: 0.5 });
      tone({ f: 3920, dur: 0.3, vol: 0.015, delay: 0.03 });
    },
    quillIn() {
      tone({ f: 2500, dur: 0.5, vol: 0.04, wet: 0.5 }); tone({ f: 3710, dur: 0.35, vol: 0.02 });
      tone({ f: 600, f2: 1200, dur: 0.08, vol: 0.06, delay: 0.05 });
    },
    quillTap() {
      burst({ f: 1200, q: 4, dur: 0.06, vol: 0.28 });
      burst({ f: 1500, q: 4, dur: 0.04, vol: 0.12, delay: 0.09 });
      burst({ f: 1700, q: 4, dur: 0.03, vol: 0.05, delay: 0.15 });
    },
    drip() { tone({ f: 1900 + R() * 500, f2: 800, dur: 0.035, vol: 0.06 }); burst({ type: 'highpass', f: 4000, dur: 0.02, vol: 0.03 }); },
    splat() { burst({ type: 'lowpass', f: 900, dur: 0.07, vol: 0.12 }); tone({ f: 900, f2: 300, dur: 0.05, vol: 0.04 }); },
    puddle() { burst({ type: 'lowpass', f: 600, dur: 0.6, attack: 0.1, vol: 0.05, noise: 'pink' }); },
    scratch() { burst({ f: 4500 + R() * 2500, q: 2.5, dur: 0.05 + R() * 0.04, vol: 0.04 + R() * 0.03 }); },
    tick() { for (let i = 0; i < 3; i++) burst({ f: 4200 + R() * 1500, q: 2, dur: 0.04, vol: 0.05, delay: i * 0.05 }); },
    blow() {
      burst({ type: 'lowpass', f: 1400, f2: 500, q: 0.6, dur: 0.55, attack: 0.08, vol: 0.28, noise: 'pink' });
      burst({ f: 300, q: 0.8, dur: 0.2, vol: 0.1, noise: 'brown', delay: 0.05 });
    },
    hiss() {
      burst({ type: 'highpass', f: 4200, q: 0.6, dur: 0.75, attack: 0.01, vol: 0.18 });
      burst({ f: 2200, q: 1.2, dur: 0.3, vol: 0.06 });
    },
    match() {
      for (let i = 0; i < 6; i++) burst({ type: 'highpass', f: 2000 + R() * 2000, dur: 0.03, vol: 0.14, delay: i * 0.025 });
      burst({ type: 'lowpass', f: 300, f2: 1500, sweep: 0.25, q: 0.8, dur: 0.6, attack: 0.08, vol: 0.22, noise: 'pink', delay: 0.15, wet: 0.3 });
    },
    ignite() {
      burst({ type: 'lowpass', f: 200, f2: 1600, sweep: 0.5, q: 0.7, dur: 0.9, attack: 0.25, vol: 0.32, noise: 'pink', wet: 0.3 });
      sfx.crease(5);
    },
    crackle(v) { burst({ type: 'highpass', f: 2500 + R() * 4000, dur: 0.008 + R() * 0.02, vol: (v || 0.1) * (0.4 + R()) }); },
    waxDrip() { tone({ f: 700 + R() * 200, f2: 300, dur: 0.06, vol: 0.06 }); burst({ type: 'lowpass', f: 700, dur: 0.05, vol: 0.06 }); },
    sizzle() { burst({ type: 'highpass', f: 5000, dur: 0.25, attack: 0.03, vol: 0.05 }); },
    stamp() {
      tone({ f: 140, f2: 55, dur: 0.22, vol: 0.45 });
      burst({ type: 'lowpass', f: 500, q: 1, dur: 0.18, vol: 0.18, noise: 'pink' });
      burst({ f: 900, q: 2, dur: 0.12, vol: 0.05, delay: 0.05 });
    },
    slide(d) { burst({ f: 2400, q: 0.5, dur: d || 0.5, attack: (d || 0.5) * 0.4, vol: 0.12, noise: 'pink' }); },
    coo() {
      const c = ready(); if (!c) return;
      [[0, 0.32, 290, 340], [0.38, 0.75, 330, 250]].forEach(function (s) {
        const t = c.currentTime + s[0], d = s[1];
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(s[2], t); o.frequency.linearRampToValueAtTime(s[3], t + d);
        const trem = c.createOscillator(); trem.frequency.value = 26;
        const tg = c.createGain(); tg.gain.value = 0.45;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        const am = c.createGain(); am.gain.value = 0.55;
        trem.connect(tg); tg.connect(am.gain);
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 1.2;
        o.connect(f); f.connect(am); am.connect(g); g.connect(bus);
        const w = c.createGain(); w.gain.value = 0.3; g.connect(w); w.connect(revSend);
        o.start(t); trem.start(t); o.stop(t + d + 0.05); trem.stop(t + d + 0.05);
      });
    },
    flap(strong) {
      burst({ type: 'bandpass', f: strong ? 1400 : 700, q: 0.8, dur: strong ? 0.05 : 0.09, attack: 0.003, vol: strong ? 0.32 : 0.14, noise: strong ? 'white' : 'pink' });
    },
    thud() { burst({ type: 'lowpass', f: 180, dur: 0.12, vol: 0.3, noise: 'brown' }); }
  };

  /* ---------- musique ---------- */
  const BPM = 96, BEAT = 60 / BPM, BAR = 3 * BEAT;
  const A = [
    [[69, 1], [74, .5], [72, .5], [69, 1]], [[67, 1], [64, .5], [65, .5], [67, 1]],
    [[69, .5], [71, .5], [72, 1], [69, 1]], [[64, 1.5], [62, .5], [64, 1]],
    [[65, 1], [69, .5], [72, .5], [74, 1]], [[72, 1], [71, .5], [69, .5], [67, 1]],
    [[69, .5], [67, .5], [65, .5], [64, .5], [65, .5], [67, .5]], [[62, 3]]
  ];
  const B = [
    [[72, .5], [74, .5], [76, 1], [74, 1]], [[72, 1], [69, .5], [67, .5], [64, 1]],
    [[65, .5], [67, .5], [69, 1], [74, 1]], [[72, 1.5], [71, .5], [69, 1]],
    [[71, 1], [74, .5], [72, .5], [71, 1]], [[72, .5], [71, .5], [69, .5], [67, .5], [64, 1]],
    [[69, 1], [67, .5], [65, .5], [64, 1]], [[62, 2], [57, 1]]
  ];
  const ROOTS_A = [50, 48, 50, 45, 41, 48, 45, 50];
  const ROOTS_B = [41, 48, 50, 45, 43, 48, 45, 50];
  const ksCache = {};
  const hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  function ks(c, midi) {
    const key = midi + '@' + c.sampleRate;
    if (ksCache[key]) return ksCache[key];
    const sr = c.sampleRate, f = hz(midi), dur = midi < 55 ? 3.2 : 2.4;
    const n = Math.floor(sr * dur), N = Math.max(2, Math.round(sr / f));
    const out = new Float32Array(n), line = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp += 0.55 * ((R() * 2 - 1) - lp); line[i] = lp; }
    // point de pincement ~1/7 de la corde : timbre plus « luth »
    const pp = Math.floor(N / 7);
    for (let i = N - 1; i >= pp; i--) line[i] -= 0.8 * line[i - pp];
    const rho = 0.9965 - (f / 12000);
    let idx = 0, peak = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx], nxt = line[(idx + 1) % N];
      out[i] = cur;
      line[idx] = rho * 0.5 * (cur + nxt);
      idx = (idx + 1) % N;
      if (Math.abs(cur) > peak) peak = Math.abs(cur);
    }
    const fade = Math.floor(sr * 0.08);
    for (let i = 0; i < n; i++) { out[i] /= (peak || 1); if (i > n - fade) out[i] *= (n - i) / fade; }
    const b = c.createBuffer(1, n, sr); b.copyToChannel(out, 0);
    return (ksCache[key] = b);
  }

  const music = {
    timer: null, nodes: null,
    start(c, out) {
      const self = this;
      if (!bus) { ctx = c; build(); }
      // corps du luth : deux résonances + douceur des aigus
      const body1 = c.createBiquadFilter(); body1.type = 'peaking'; body1.frequency.value = 230; body1.Q.value = 1.1; body1.gain.value = 5;
      const body2 = c.createBiquadFilter(); body2.type = 'peaking'; body2.frequency.value = 1150; body2.Q.value = 1.4; body2.gain.value = 3;
      const soft = c.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 4200;
      const mix = c.createGain(); mix.gain.value = 1;
      body1.connect(body2); body2.connect(soft); soft.connect(mix);
      mix.connect(out);
      const wet = c.createGain(); wet.gain.value = 0.35; mix.connect(wet);
      const r = c.createConvolver(); r.buffer = rev.buffer; wet.connect(r); r.connect(out);
      // bourdon de vielle : ré + la, très doux, avec un léger vibrato
      const drone = c.createGain(); drone.gain.setValueAtTime(0, c.currentTime); drone.gain.linearRampToValueAtTime(0.05, c.currentTime + 4);
      const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 850; dlp.Q.value = 0.7;
      drone.connect(dlp); dlp.connect(mix);
      const oscs = [];
      [[38, 0], [45, 3], [50, -4]].forEach(function (d) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(d[0]); o.detune.value = d[1];
        const v = c.createOscillator(); v.frequency.value = 4.8 + R(); const vg = c.createGain(); vg.gain.value = 3;
        v.connect(vg); vg.connect(o.detune);
        const og = c.createGain(); og.gain.value = d[0] === 38 ? 0.6 : 0.35;
        o.connect(og); og.connect(drone); o.start(); v.start(); oscs.push(o, v);
      });
      this.nodes = { input: body1, drone: drone, oscs: oscs, mix: mix };
      let next = c.currentTime + 0.4, bar = 0;
      function tick() {
        while (next < c.currentTime + 0.5) {
          const section = Math.floor(bar / 8) % 2 === 0 ? A : B;
          const roots = section === A ? ROOTS_A : ROOTS_B;
          const m = section[bar % 8];
          let tb = 0;
          m.forEach(function (n) {
            self.pluck(c, n[0], next + tb * BEAT + (R() - 0.5) * 0.012, 0.55 + R() * 0.1);
            tb += n[1];
          });
          const root = roots[bar % 8];
          self.pluck(c, root, next, 0.42);
          self.pluck(c, root + 7, next + BEAT, 0.22);
          self.pluck(c, root + 12, next + 2 * BEAT, 0.2);
          bar++; next += BAR;
          if (bar % 32 === 0) next += 2 * BAR;
        }
      }
      tick();
      this.timer = setInterval(tick, 100);
    },
    pluck(c, midi, t, vol) {
      const s = c.createBufferSource(); s.buffer = ks(c, midi);
      const g = c.createGain(); g.gain.value = vol;
      s.connect(g); g.connect(this.nodes.input); s.start(Math.max(t, c.currentTime));
    },
    stop() {
      clearInterval(this.timer); this.timer = null;
      const n = this.nodes; if (!n) return;
      setTimeout(function () { n.oscs.forEach(function (o) { try { o.stop(); } catch (e) { /* déjà arrêté */ } }); n.mix.disconnect(); }, 800);
      this.nodes = null;
    }
  };
  P.music.setGenerator(music);

  window.ParcheminAudio = { sfx: sfx, loop: loop, ready: ready };
})();
