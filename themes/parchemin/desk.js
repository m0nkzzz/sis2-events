/* ============================================================
 *  Thème « Parchemin » — le bureau du scribe
 *  Scène canvas interactive : objets à attraper avec inertie,
 *  avion en papier, gouttes et flaques d'encre, bougie qui
 *  réagit au vent et s'éteint, papier qui brûle, éclairage
 *  dynamique de toute la page, aides fléchées, et la séquence
 *  d'envoi (pliage, enveloppe, cire, cachet, pigeon).
 * ============================================================ */
(function () {
  'use strict';
  const P = window.Platform, Art = window.Art;
  if (!P || !Art) return;
  const AU = window.ParcheminAudio || { sfx: new Proxy({}, { get: function () { return function () {}; } }), loop: function () {} };
  const sfx = AU.sfx;
  const T = P.text;
  const clamp = Art.clamp, lerp = Art.lerp;
  const TAU = Math.PI * 2;
  const R = Math.random;

  /* ============ couches ============ */
  const world = document.createElement('canvas'); world.className = 'desk-world';
  const light = document.createElement('canvas'); light.className = 'desk-light'; light.setAttribute('aria-hidden', 'true');
  const fx = document.createElement('canvas'); fx.className = 'desk-fx'; fx.setAttribute('aria-hidden', 'true');
  const ui = document.createElement('div'); ui.className = 'desk-ui';
  const hintSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); hintSvg.setAttribute('class', 'hint-svg'); hintSvg.setAttribute('aria-hidden', 'true');
  ui.appendChild(hintSvg);
  world.setAttribute('role', 'img');
  world.setAttribute('aria-label', 'Bureau du scribe : une pile de parchemins, un encrier avec sa plume, une bougie.');
  const wx = world.getContext('2d'), lx = light.getContext('2d'), fxx = fx.getContext('2d');

  let W = 0, H = 0, dpr = 1, S = 1, mobile = false;
  const LIGHT_K = 0.25;
  const tex = {};
  const L = {};
  let mode = 'boot';
  let now = 0;
  const opts = {};

  /* ============ état du monde ============ */
  const objs = [];           // objets mobiles : feuilles, plume, carte, dé, avions
  const stains = [];         // taches d'encre (table ou feuille)
  const drops = [];          // gouttes en chute
  const smoke = [];
  const flames = [];         // particules de feu (papier qui brûle)
  const ash = [];
  const actors = [];         // éléments de la séquence d'envoi
  const tweens = [];
  const pointer = { x: -999, y: -999, vx: 0, vy: 0, down: false, held: null, downAt: 0, downX: 0, downY: 0, moved: 0, target: null, lastT: 0 };
  const candle = { lit: true, light: 1, lean: { x: 0, y: 0 }, leanV: { x: 0, y: 0 }, wind: { x: 0, y: 0 }, size: 1, ember: 0, smokeT: 0 };
  const stage = { s: 'sheet', planes: 0, stackClicks: 0, wellClicks: 0, quillWrong: 0, idle: 0, hint: null };
  let quill = null;
  let paperSeed = 1;

  /* ============ utilitaires ============ */
  function tween(dur, fn, ease) {
    return new Promise(function (res) { tweens.push({ t: 0, dur: Math.max(0.001, dur * (P.reducedMotion ? 0.3 : 1)), fn: fn, ease: ease || easeInOut, res: res }); });
  }
  const easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  const easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  const easeIn = function (t) { return t * t * t; };
  const linear = function (t) { return t; };
  const wait = function (s) { return tween(s, function () {}, linear); };
  function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
  function toLocal(o, px, py) { return rot(px - o.x, py - o.y, -o.a); }
  function toWorld(o, lx0, ly0) { const r = rot(lx0, ly0, o.a); return [o.x + r[0], o.y + r[1]]; }
  function inRect(o, px, py, pad) { const l = toLocal(o, px, py); return Math.abs(l[0]) <= o.w / 2 + (pad || 0) && Math.abs(l[1]) <= o.h / 2 + (pad || 0); }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  /** Ombre portée floue de n'importe quel dessin, projetée à l'opposé de la bougie. */
  function shadow(x, ox, oy, z, alphaMul, draw) {
    const sh = shadowParams(ox, oy, z);
    x.save();
    x.shadowColor = 'rgba(8,4,2,' + (sh.a * (alphaMul == null ? 1 : alphaMul)) + ')';
    x.shadowBlur = sh.blur * dpr;
    x.shadowOffsetX = (sh.dx + 30000) * dpr; x.shadowOffsetY = sh.dy * dpr;
    x.translate(-30000, 0);
    draw(x);
    x.restore();
  }
  function shadowParams(ox, oy, z) {
    let dx, dy;
    if (candle.light > 0.15) {
      const fl = flamePos();
      dx = ox - fl.x; dy = oy - fl.y;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    } else { dx = 0.45; dy = 0.7; }
    const len = (3 + z * 30) * S * (candle.light > 0.15 ? 1 : 0.6);
    return { dx: dx * len, dy: dy * len, blur: (3 + z * 18) * S, a: clamp(0.62 - z * 0.13, 0.18, 0.62) * (0.55 + 0.45 * candle.light) };
  }

  /* ============ disposition ============ */
  function layout() {
    const oldW = W, oldH = H;
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    mobile = W < 720;
    S = clamp(Math.min(W / 1320, H / 840), 0.52, 1.25);
    if (mobile) S = clamp(Math.min(W / 520, H / 900), 0.5, 0.9);
    [world, fx].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    light.width = Math.ceil(W * LIGHT_K); light.height = Math.ceil(H * LIGHT_K);
    const bw = mobile ? W * 0.78 : Math.min(W * 0.42, 560 * S), bh = mobile ? bw * 0.86 : bw * 0.7;
    L.blot = { x: W / 2, y: mobile ? H * 0.5 : H * 0.55, w: bw, h: bh };
    L.sheetW = (mobile ? 0.36 : 0.3) * bw; L.sheetH = L.sheetW * 1.36;
    L.stack = mobile ? { x: W * 0.2, y: H * 0.84 } : { x: L.blot.x - bw / 2 - 170 * S, y: H * 0.56 };
    L.well = mobile ? { x: W * 0.8, y: H * 0.86 } : { x: L.blot.x + bw / 2 + 165 * S, y: H * 0.68 };
    L.candle = mobile ? { x: W - 64 * S, y: 120 * S } : { x: W - 150 * S, y: 175 * S };
    L.candleR = 22 * S; L.candleH = 72 * S;
    L.note = mobile ? { x: W * 0.4, y: H * 0.13 } : { x: W / 2, y: H * 0.15 };
    L.quillL = (mobile ? 230 : 300) * S;
    // décale les objets libres si la fenêtre change de taille
    if (oldW && (oldW !== W || oldH !== H)) objs.forEach(function (o) { o.x *= W / oldW; o.y *= H / oldH; });
  }

  /* ============ textures ============ */
  function buildTextures() {
    tex.wood = Art.wood(W, H, mobile ? 0.45 : 0.5);
    tex.leather = Art.leather(L.blot.w, L.blot.h);
    tex.papers = [];
    for (let i = 0; i < 4; i++) tex.papers.push(Art.paper(L.sheetW * dpr, L.sheetH * dpr, { seed: 3 + i * 17, scale: dpr, spots: 2 + i, edge: 10 }));
    tex.quill = Art.quill(L.quillL, dpr * 1.2);
    tex.well = Art.inkwell(130 * S, dpr);
    tex.candle = Art.candleBase(72 * S, dpr);
    tex.dice = [];
    for (let n = 1; n <= 20; n++) tex.dice[n] = Art.d20(32 * S, dpr, n);
    tex.envPaper = Art.paper(300 * S * dpr, 200 * S * dpr, { seed: 77, scale: dpr, tone: [226, 211, 180], spots: 1, edge: 30, deckle: 0.2 });
    tex.stack = buildStack();
    tex.note = buildNote();
  }

  function buildStack() {
    const w = L.sheetW, h = L.sheetH, pad = 30 * S;
    const c = Art.canvas((w + pad * 2) * dpr, (h + pad * 2) * dpr), x = c.getContext('2d');
    x.scale(dpr, dpr); x.translate(pad + w / 2, pad + h / 2);
    [[-0.07, 5, 6], [0.05, -4, 4], [-0.02, 3, 2], [0.03, -1, 1]].forEach(function (s, i) {
      x.save(); x.translate(s[1] * S, s[2] * S); x.rotate(s[0]);
      x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 4 * S * dpr; x.shadowOffsetY = 1.5 * S * dpr;
      x.drawImage(tex.papers[i % 4], -w / 2, -h / 2, w, h);
      x.restore();
    });
    // ficelle de chanvre autour de la pile
    x.strokeStyle = 'rgba(150,115,70,.95)'; x.lineWidth = 2.4 * S;
    x.beginPath(); x.moveTo(-w / 2 - 6 * S, -h * 0.08); x.bezierCurveTo(-w * 0.2, -h * 0.1, w * 0.2, -h * 0.06, w / 2 + 6 * S, -h * 0.09); x.stroke();
    x.strokeStyle = 'rgba(90,65,35,.6)'; x.lineWidth = 0.8 * S; x.setLineDash([2 * S, 2 * S]);
    x.beginPath(); x.moveTo(-w / 2 - 6 * S, -h * 0.08); x.bezierCurveTo(-w * 0.2, -h * 0.1, w * 0.2, -h * 0.06, w / 2 + 6 * S, -h * 0.09); x.stroke();
    return { img: c, pad: pad };
  }

  function buildNote() {
    const w = (mobile ? 250 : 340) * S, h = w * 0.46;
    const t = Art.paper(w * dpr, h * dpr, { seed: 41, scale: dpr, tone: [238, 226, 198], spots: 1, edge: 12 });
    const x = t.getContext('2d');
    x.scale(dpr, dpr);
    x.textAlign = 'center';
    x.fillStyle = '#8b1e1e';
    x.font = (11.5 * S * (mobile ? 0.9 : 1)) + 'px "IM Fell English SC", Georgia, serif';
    x.fillText((T('introKicker', 'Convocation')).toUpperCase().split('').join(' '), w / 2, h * 0.28);
    x.fillStyle = 'rgba(28,16,10,.92)';
    x.font = (27 * S * (mobile ? 0.82 : 1)) + 'px "IM Fell English", Georgia, serif';
    x.fillText(T('introTitle', P.event.title), w / 2, h * 0.58);
    x.fillStyle = 'rgba(60,40,25,.8)';
    x.font = 'italic ' + (12.5 * S * (mobile ? 0.9 : 1)) + 'px "IM Fell English", Georgia, serif';
    x.fillText(T('introLine', ''), w / 2, h * 0.8);
    return { img: t, w: w, h: h };
  }

  /* ============ objets ============ */
  function makeSheet(x0, y0, a) {
    const t = tex.papers[(paperSeed++) % tex.papers.length];
    const o = body({ kind: 'sheet', x: x0, y: y0, a: a, w: L.sheetW, h: L.sheetH, tex: t, heat: 0, burn: null, ink: null, state: 'free' });
    o.I = (o.w * o.w + o.h * o.h) / 12;
    objs.push(o);
    return o;
  }
  function body(o) {
    return Object.assign({ vx: 0, vy: 0, va: 0, z: 0, vz: 0, held: false, gx: 0, gy: 0, I: 1000, drag: 5, alive: true }, o);
  }

  function makeQuill() {
    quill = body({ kind: 'quill', x: 0, y: 0, a: 0, w: L.quillL, h: 30 * S, state: 'well', ink: 10, dripT: 0.6, puddle: null });
    quill.I = (L.quillL * L.quillL) / 12;
    objs.push(quill);
  }
  function quillWellGeom() {
    const lean = -0.32 + Math.sin(now * 0.7) * 0.01;
    const len = L.quillL * 0.86;
    const nx = L.well.x - 2 * S, ny = L.well.y - 14 * S;
    return { nx: nx, ny: ny, tx: nx + Math.sin(lean) * len, ty: ny - Math.cos(lean) * len, a: -Math.PI / 2 + lean, len: len };
  }
  function nibOf(q) {
    if (q.state === 'well') { const g = quillWellGeom(); return [g.nx, g.ny]; }
    return toWorld(q, -q.w / 2, 0);
  }

  function flamePos() {
    const lean = candle.lean;
    return { x: L.candle.x + lean.x * 6 * S, y: L.candle.y - L.candleH - 0.55 * L.candleR + lean.y * 3 * S };
  }

  /* ============ interaction ============ */
  function pick(px, py) {
    // du plus haut au plus bas
    const list = objs.filter(function (o) { return o.alive && o.state !== 'plane' && o.state !== 'gone' && o.state !== 'writing'; })
      .sort(function (a, b) { return (b.z - a.z) || (objs.indexOf(b) - objs.indexOf(a)); });
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind === 'quill') {
        if (o.state === 'well') continue;
        const n = toWorld(o, -o.w / 2, 0), t = toWorld(o, o.w / 2, 0);
        if (segDist(px, py, n[0], n[1], t[0], t[1]) < Math.max(18 * S, 20)) return o;
      } else if (inRect(o, px, py, 4 * S)) return o;
    }
    if (quill && quill.state === 'well') {
      const g = quillWellGeom();
      if (segDist(px, py, g.nx, g.ny, g.tx, g.ty) < Math.max(20 * S, 24) || Math.hypot(px - L.well.x, py - L.well.y) < Math.max(52 * S, 40)) return quill;
    }
    if (Math.abs(px - L.stack.x) < L.sheetW * 0.6 && Math.abs(py - L.stack.y) < L.sheetH * 0.6) return 'stack';
    if (Math.hypot(px - L.candle.x, py - L.candle.y) < 60 * S || Math.hypot(px - L.candle.x, py - (L.candle.y - L.candleH)) < 34 * S) return 'candle';
    return null;
  }

  function grab(o, px, py) {
    if (o.kind === 'quill' && o.state === 'well') {
      const g = quillWellGeom();
      o.a = Math.atan2(g.ty - g.ny, g.tx - g.nx);
      const c = [g.nx + Math.cos(o.a) * o.w / 2, g.ny + Math.sin(o.a) * o.w / 2];
      o.x = c[0]; o.y = c[1]; o.z = 0.8; o.vx = o.vy = o.va = 0;
      o.state = 'free';
      sfx.quillOut();
      if (o.puddle) o.puddle = null;
    } else if (o.kind === 'quill') {
      sfx.tick();
      if (o.puddle) { o.puddle.fade = true; o.puddle = null; }
    } else if (o.kind === 'sheet' || o.kind === 'card') sfx.paperGrab();
    else if (o.kind === 'die') sfx.thud();
    o.held = true;
    const l = toLocal(o, px, py);
    o.gx = l[0]; o.gy = l[1];
    if (o.state === 'placed') o.state = 'free';
    pointer.held = o;
    // l'objet pris passe au-dessus des autres
    objs.splice(objs.indexOf(o), 1); objs.push(o);
  }

  function release(o) {
    o.held = false; pointer.held = null;
    o.vz = 0.4;
    const speed = Math.hypot(o.vx, o.vy);
    if (o.kind === 'sheet') {
      if (o.burn) return;                                        // une feuille en feu tombe là où on la lâche
      if (o.fromStack && pointer.moved < 26 * S) {             // simple clic sur la pile : on la repose
        o.alive = false; stage.stackClicks++; sfx.paperDrop(); return;
      }
      o.fromStack = false;
      const b = L.blot;
      if (Math.abs(o.x - b.x) < b.w / 2 - o.w * 0.25 && Math.abs(o.y - b.y) < b.h / 2 - o.h * 0.22) {
        o.state = 'placed'; o.tx = b.x + (R() - 0.5) * 6 * S; o.ty = b.y + (R() - 0.5) * 6 * S; o.ta = (R() - 0.5) * 0.06;
        if (stage.s === 'sheet') { stage.s = 'quill'; stage.idle = 0; hideHint(); }
      } else toPlane(o, speed);
    } else if (o.kind === 'die') {
      let spd = speed;
      // simple clic : on le lance sur place dans une direction au hasard
      if (pointer.moved < 8) { const a = R() * TAU, v = (260 + R() * 220) * S; o.vx = Math.cos(a) * v; o.vy = Math.sin(a) * v; spd = v; }
      if (spd > 120 * S) {
        o.rolling = true; o.tumble = 0; o.lastTumble = 0;
        o.vz = 2 + Math.min(2.5, spd / (900 * S)); o.z = Math.max(o.z, 0.3);
        o.va += (R() - 0.5) * 16;
        sfx.dieShake();
        if (dieLabel) dieLabel.classList.remove('is-on');
      }
    } else if (o.kind === 'quill') {
      const nib = nibOf(o);
      if (Math.hypot(nib[0] - L.well.x, nib[1] - L.well.y) < 40 * S) { o.state = 'returning'; returnQuill(o); return; }
      const sheet = objs.find(function (s) { return s.kind === 'sheet' && s.alive && s.state === 'placed' && !s.burn && inRect(s, nib[0], nib[1], -4 * S); });
      if (sheet && stage.s !== 'done') { writeOn(sheet); return; }
      o.state = 'falling';
      stage.quillWrong++;
    }
  }

  function toPlane(o, speed) {
    o.state = 'plane';
    let dx, dy;
    if (speed > 220 * S) { dx = o.vx / speed; dy = o.vy / speed; }
    else { dx = o.x - L.blot.x; dy = o.y - L.blot.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; dy -= 0.3; const d2 = Math.hypot(dx, dy); dx /= d2; dy /= d2; }
    o.heading = Math.atan2(dy, dx);
    o.fold = 0; o.flyT = 0; o.a0 = o.a;
    o.speed = Math.max(speed, 80 * S);
    stage.planes++;
    sfx.crease(9);
    tween(0.55, function (t) { o.fold = t; }, easeInOut).then(function () { sfx.whoosh(1); });
  }

  function returnQuill(o) {
    const g = quillWellGeom();
    const from = { x: o.x, y: o.y, a: o.a };
    const toA = Math.atan2(g.ty - g.ny, g.tx - g.nx);
    const to = { x: g.nx + Math.cos(toA) * o.w / 2, y: g.ny + Math.sin(toA) * o.w / 2 };
    let da = toA - from.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    tween(0.35, function (t) { o.x = lerp(from.x, to.x, t); o.y = lerp(from.y, to.y, t); o.a = from.a + da * t; }, easeOut).then(function () {
      o.state = 'well'; o.ink = 10; o.z = 0; o.vx = o.vy = o.va = 0; sfx.quillIn();
    });
  }

  /* --- la plume écrit sur la feuille : fin de l'accueil --- */
  async function writeOn(sheet) {
    stage.s = 'done'; hideHint();
    quill.state = 'writing';
    if (!sheet.ink) { sheet.ink = Art.canvas(sheet.w * dpr, sheet.h * dpr); }
    const ix = sheet.ink.getContext('2d'); ix.scale(dpr, dpr);
    ix.strokeStyle = 'rgba(18,12,20,.85)'; ix.lineCap = 'round'; ix.lineJoin = 'round';
    const lines = [[0.18, 0.2, 0.82], [0.29, 0.16, 0.86], [0.4, 0.16, 0.7]];
    const pos = function (lx0, ly0) { return toWorld(sheet, lx0 - sheet.w / 2, ly0 - sheet.h / 2); };
    const setNib = function (wxp, wyp) {
      quill.a = -0.95 + Math.sin(now * 9) * 0.03;
      const c = [wxp + Math.cos(quill.a) * quill.w / 2, wyp + Math.sin(quill.a) * quill.w / 2];
      quill.x = c[0]; quill.y = c[1];
    };
    quill.z = 0.25;
    for (let li = 0; li < lines.length; li++) {
      const ln = lines[li];
      let last = null;
      await tween(0.55, function (t) {
        const lxp = sheet.w * lerp(ln[1], ln[2], t);
        const lyp = sheet.h * ln[0] + Math.sin(t * 60) * 2.2 * S + Math.sin(t * 13) * 1.2 * S;
        if (last) { ix.lineWidth = (0.9 + Math.abs(Math.sin(t * 60)) * 0.9) * S; ix.beginPath(); ix.moveTo(last[0], last[1]); ix.lineTo(lxp, lyp); ix.stroke(); }
        last = [lxp, lyp];
        const w0 = pos(lxp, lyp); setNib(w0[0], w0[1]);
        if (R() < 0.35) sfx.scratch();
      }, linear);
    }
    await wait(0.15);
    quill.z = 0.9;
    await tween(0.35, function (t) { quill.y -= 2 * S * (1 - t); }, easeOut);
    // la plume retourne dans l'encrier, la feuille devient la lettre
    returnQuill(quill);
    const rect = sheetRect(sheet);
    if (opts.onLetter) opts.onLetter(rect, sheet);
    // la feuille du bureau « devient » la lettre affichée par-dessus
    setTimeout(function () { sheet.alive = false; }, 900);
  }

  function sheetRect(o) { return { x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h, a: o.a }; }

  /* --- bougie --- */
  function toggleCandle(force) {
    const on = force == null ? !candle.lit : force;
    if (on === candle.lit) return;
    candle.lit = on;
    if (on) {
      sfx.match();
      tween(0.7, function (t) { candle.light = t; candle.size = easeOut(t); }, linear);
    } else {
      sfx.blow();
      candle.smokeT = 3.2; candle.ember = 1;
      tween(0.25, function (t) { candle.size = 1 - t; candle.light = 1 - t; }, easeIn);
    }
  }
  function extinguishByDrop() {
    if (!candle.lit) return;
    candle.lit = false;
    sfx.hiss();
    candle.smokeT = 3.6; candle.ember = 0.6;
    for (let i = 0; i < 14; i++) spawnSmoke(flamePos().x, flamePos().y, 1.4, true);
    tween(0.12, function (t) { candle.size = 1 - t; candle.light = 1 - t; }, easeIn);
  }

  /* ============ pointeur ============ */
  function onDown(e) {
    if (mode === 'send') return;
    const px = e.clientX, py = e.clientY;
    pointer.down = true; pointer.downAt = now; pointer.downX = px; pointer.downY = py; pointer.moved = 0;
    pointer.x = px; pointer.y = py;
    stage.idle = 0;
    AU.ready && AU.ready();
    if (!P.music.playing && !P.music.muted) { P.music.start(); if (opts.onSound) opts.onSound(); }
    const t = pick(px, py);
    pointer.target = t;
    if (t === 'stack') {
      const s = makeSheet(L.stack.x - 1 * S, L.stack.y - 1 * S, 0.03);
      s.fromStack = true;
      grab(s, px, py);
    } else if (t === 'candle') {
      /* décidé au relâchement */
    } else if (t) {
      if (t.kind === 'quill' && t.state === 'well' && stage.s === 'sheet') stage.wellClicks++;
      grab(t, px, py);
    }
    if (t) { try { world.setPointerCapture(e.pointerId); } catch (er) { /* rien */ } e.preventDefault(); }
  }
  function onMove(e) {
    const px = e.clientX, py = e.clientY;
    const dt = Math.max(0.008, (e.timeStamp - pointer.lastT) / 1000 || 0.016);
    if (pointer.lastT) {
      const vx = (px - pointer.x) / dt, vy = (py - pointer.y) / dt;
      pointer.vx = pointer.vx * 0.5 + vx * 0.5; pointer.vy = pointer.vy * 0.5 + vy * 0.5;
    }
    pointer.lastT = e.timeStamp;
    if (pointer.down) pointer.moved += Math.hypot(px - pointer.x, py - pointer.y);
    pointer.x = px; pointer.y = py;
    // le souffle de la main sur la flamme
    windFrom(px, py, pointer.vx, pointer.vy, 1);
    const t = pointer.held ? null : pick(px, py);
    world.style.cursor = pointer.held ? 'grabbing' : (t === 'candle' ? 'pointer' : (t ? 'grab' : ''));
  }
  function onUp() {
    if (!pointer.down) return;
    pointer.down = false;
    if (pointer.held) release(pointer.held);
    else if (pointer.target === 'candle' && pointer.moved < 8 && now - pointer.downAt < 0.6) toggleCandle();
    if (pointer.target && pointer.target.kind === 'quill' && pointer.moved < 8 && stage.s === 'quill') stage.wellClicks++;
    pointer.target = null;
  }

  function windFrom(px, py, vx, vy, k) {
    const fl = flamePos();
    const d = Math.hypot(px - fl.x, py - fl.y);
    const r = 170 * S;
    if (d > r) return;
    const f = Math.pow(1 - d / r, 1.6) * 0.0011 * k / S;
    candle.wind.x += vx * f; candle.wind.y += vy * f;
  }

  /* ============ particules ============ */
  function spawnSmoke(x0, y0, life, puff) {
    smoke.push({ x: x0 + (R() - 0.5) * 3 * S, y: y0, vx: (R() - 0.5) * 12 * S + candle.lean.x * 20 * S, vy: -(28 + R() * 30) * S * (puff ? 1.6 : 1), r: (3 + R() * 4) * S, life: life || 2.6, t: 0, ph: R() * TAU });
  }

  function spawnDrop(nx, ny, z) {
    drops.push({ x: nx, y: ny, z: z, vz: 0, r: (1.6 + R() * 1.6) * S });
    sfx.drip();
  }

  function addStain(x0, y0, r, onSheet, life) {
    const st = { x: x0, y: y0, r: r, seed: 1 + Math.floor(R() * 999), t: 0, life: life || 5, sheet: onSheet || null, sat: [] };
    if (onSheet) { const l = toLocal(onSheet, x0, y0); st.lx = l[0]; st.ly = l[1]; }
    const n = 2 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) { const a = R() * TAU, d = r * (1.4 + R() * 1.8); st.sat.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.12 + R() * 0.25)]); }
    stains.push(st);
    return st;
  }

  /* ============ boucle ============ */
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    if (mode !== 'boot' && !document.hidden) {
      now += dt;
      update(dt);
      render();
    }
    requestAnimationFrame(frame);
  }

  function update(dt) {
    // animations programmées
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) physics(h);
    updateCandle(dt);
    updateQuill(dt);
    updateDrops(dt);
    updateBurn(dt);
    updateParticles(dt);
    updateHints(dt);
    // son de frottement du papier
    let slide = 0;
    objs.forEach(function (o) {
      if ((o.kind === 'sheet' || o.kind === 'card') && (o.held || o.z < 0.05) && o.state !== 'plane') slide = Math.max(slide, Math.hypot(o.vx, o.vy) / (1600 * S) + Math.abs(o.va) * 0.08);
    });
    AU.loop('slide', clamp(slide, 0, 1));
  }

  function physics(dt) {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (!o.alive || o.state === 'well' || o.state === 'writing' || o.state === 'returning') continue;
      if (o.state === 'plane') { planePhysics(o, dt); continue; }
      if (o.held) {
        const g = toWorld(o, o.gx, o.gy);
        const rx = g[0] - o.x, ry = g[1] - o.y;
        const gvx = o.vx - o.va * ry, gvy = o.vy + o.va * rx;
        const k = 260, c = 2 * 0.72 * Math.sqrt(k);
        const fx0 = k * (pointer.x - g[0]) - c * gvx, fy0 = k * (pointer.y - g[1]) - c * gvy;
        // traînée de l'air au centre : l'objet s'aligne derrière le mouvement
        const dragK = o.kind === 'quill' ? 3.2 : 4.2;
        const ax = fx0 - o.vx * dragK, ay = fy0 - o.vy * dragK;
        const torque = rx * fy0 - ry * fx0;
        o.vx += ax * dt; o.vy += ay * dt;
        o.va += (torque / (o.I * 0.9)) * dt;
        o.va *= Math.exp(-3.2 * dt);
        o.z += (1 - o.z) * (1 - Math.exp(-10 * dt));
        windFrom(o.x, o.y, o.vx, o.vy, 0.6);
      } else if (o.state === 'placed') {
        o.x += (o.tx - o.x) * (1 - Math.exp(-9 * dt)); o.y += (o.ty - o.y) * (1 - Math.exp(-9 * dt));
        o.a += (o.ta - o.a) * (1 - Math.exp(-9 * dt));
        o.vx = o.vy = o.va = 0;
        if (o.z > 0) { o.z = Math.max(0, o.z - dt * 3.2); if (o.z === 0) sfx.paperDrop(); }
      } else {
        // en l'air puis glisse sur la table
        if (o.z > 0) {
          o.vz -= 9 * dt; o.z += o.vz * dt;
          if (o.z <= 0) {
            const impact = -o.vz;
            o.z = 0;
            if (o.kind === 'quill') {
              if (impact > 1.2) { o.vz = impact * 0.28; o.z = 0.001; sfx.quillTap(); }
              else { o.vz = 0; if (o.state === 'falling') landQuill(o); }
            } else if (o.kind === 'die') { if (impact > 0.6) { o.vz = impact * 0.42; o.z = 0.001; sfx.dieHit(impact / 4); o.va += (R() - 0.5) * 6; } else o.vz = 0; }
            else { o.vz = 0; sfx.paperDrop(); }
          }
          o.vx *= Math.exp(-0.9 * dt); o.vy *= Math.exp(-0.9 * dt); o.va *= Math.exp(-1.5 * dt);
        } else {
          const fr = o.kind === 'quill' ? 9 : o.kind === 'die' ? (o.rolling ? 1.7 : 5) : 6.5;
          if (o.kind === 'die' && o.rolling) rollDie(o, dt);
          o.vx *= Math.exp(-fr * dt); o.vy *= Math.exp(-fr * dt); o.va *= Math.exp(-fr * 1.2 * dt);
          if (o.kind === 'quill' && o.state === 'falling' && Math.hypot(o.vx, o.vy) < 30 * S) landQuill(o);
        }
      }
      if (o.kind === 'die' && o.rolling && o.z > 0) { o.tumble += Math.hypot(o.vx, o.vy) * dt / (22 * S) + dt * 6; if (Math.floor(o.tumble) !== o.lastTumble) { o.lastTumble = Math.floor(o.tumble); o.face = 1 + Math.floor(R() * 20); } }
      o.x += o.vx * dt; o.y += o.vy * dt; o.a += o.va * dt;
      // les bords du bureau renvoient les objets
      if (!o.held && o.state !== 'plane') {
        const m = 10 * S;
        if (o.x < m) { o.x = m; o.vx = Math.abs(o.vx) * 0.4; }
        if (o.x > W - m) { o.x = W - m; o.vx = -Math.abs(o.vx) * 0.4; }
        if (o.y < m) { o.y = m; o.vy = Math.abs(o.vy) * 0.4; }
        if (o.y > H - m) { o.y = H - m; o.vy = -Math.abs(o.vy) * 0.4; }
      }
    }
    for (let i = objs.length - 1; i >= 0; i--) if (!objs[i].alive) objs.splice(i, 1);
  }

  /* --- le d20 roule sur la table : chaque bascule montre une autre face --- */
  function rollDie(o, dt) {
    const sp = Math.hypot(o.vx, o.vy);
    o.tumble += sp * dt / (20 * S);
    if (Math.floor(o.tumble) !== o.lastTumble) {
      o.lastTumble = Math.floor(o.tumble);
      o.face = 1 + Math.floor(R() * 20);
      o.va += (R() - 0.5) * 4;
      sfx.dieHit(Math.min(1, sp / (700 * S)));
    }
    if (sp < 22 * S) {
      o.rolling = false; o.vx *= 0.3; o.vy *= 0.3; o.va *= 0.3;
      o.face = 1 + Math.floor(R() * 20);            // le vrai tirage
      sfx.dieHit(0.25);
      showDieResult(o);
    }
  }
  let dieLabel = null, dieT = null;
  function showDieResult(o) {
    if (!dieLabel) { dieLabel = document.createElement('div'); dieLabel.className = 'die-result'; dieLabel.setAttribute('role', 'status'); ui.appendChild(dieLabel); }
    const n = o.face;
    dieLabel.textContent = n === 20 ? T('dieCrit', '20 naturel ! Coup critique') : n === 1 ? T('dieFail', '1… Échec critique') : String(n);
    dieLabel.className = 'die-result' + (n === 20 ? ' is-crit' : n === 1 ? ' is-fail' : '');
    dieLabel.style.left = o.x + 'px'; dieLabel.style.top = (o.y - 34 * S) + 'px';
    void dieLabel.offsetWidth; dieLabel.classList.add('is-on');
    if (n === 20) { for (let i = 0; i < 3; i++) setTimeout(function () { sfx.tick(); }, i * 90); }
    clearTimeout(dieT); dieT = setTimeout(function () { dieLabel.classList.remove('is-on'); }, n === 20 || n === 1 ? 2600 : 1600);
  }

  function landQuill(o) {
    if (o.state !== 'falling') return;
    o.state = 'free';
    const nib = nibOf(o);
    if (o.ink > 0 || R() < 0.8) {
      const pd = addStain(nib[0], nib[1], 0.1 * S, null, 1e9);
      pd.puddle = true; pd.grow = 0; pd.max = (12 + Math.min(o.ink, 6) * 1.6) * S; pd.fade = false;
      o.puddle = pd; o.ink = Math.max(0, o.ink - 3);
      sfx.puddle();
    }
  }

  function planePhysics(o, dt) {
    o.flyT += dt;
    const fold = o.fold;
    // le cap tourne vers la direction de vol pendant le pliage
    let target = o.heading + Math.PI / 2;
    let da = target - o.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    o.a += da * (1 - Math.exp(-6 * dt));
    if (fold < 1) {
      o.vx *= Math.exp(-4 * dt); o.vy *= Math.exp(-4 * dt);
      o.z += (1.3 - o.z) * (1 - Math.exp(-5 * dt));
    } else {
      o.speed = Math.min(1100 * S, o.speed + 900 * S * dt);
      o.heading += Math.sin(o.flyT * 2.2) * 0.35 * dt;
      o.vx = Math.cos(o.heading) * o.speed; o.vy = Math.sin(o.heading) * o.speed;
      o.z += dt * 1.6;
    }
    o.x += o.vx * dt; o.y += o.vy * dt;
    windFrom(o.x, o.y, o.vx, o.vy, 0.8);
    if (o.x < -300 * S || o.x > W + 300 * S || o.y < -300 * S || o.y > H + 300 * S) o.alive = false;
  }

  function updateCandle(dt) {
    const w = candle.wind;
    w.x *= Math.exp(-2.2 * dt); w.y *= Math.exp(-2.2 * dt);
    const mag = Math.hypot(w.x, w.y);
    if (mag > 1.4) { w.x *= 1.4 / mag; w.y *= 1.4 / mag; }
    // la flamme se penche comme un petit ressort amorti
    const l = candle.lean, v = candle.leanV;
    v.x += ((w.x - l.x) * 60 - v.x * 7) * dt; v.y += ((w.y * 0.5 - l.y) * 60 - v.y * 7) * dt;
    l.x += v.x * dt; l.y += v.y * dt;
    AU.loop('wind', candle.lit ? clamp(Math.hypot(v.x, v.y) * 0.12 + mag * 0.25, 0, 1) : 0);
    // crépitement d'ambiance
    if (candle.lit && R() < dt * (1.2 + mag * 6)) sfx.crackle(0.04 + mag * 0.05);
    if (candle.smokeT > 0) {
      candle.smokeT -= dt;
      if (R() < dt * 26 * Math.min(1, candle.smokeT)) { const f = flamePos(); spawnSmoke(f.x, f.y + 6 * S, 3); }
    }
    if (!candle.lit) candle.ember = Math.max(0, candle.ember - dt * 0.4);
  }

  function updateQuill(dt) {
    const q = quill; if (!q) return;
    if (q.held && q.ink >= 0) {
      const nib = nibOf(q);
      const fl = flamePos();
      const over = candle.lit && Math.hypot(nib[0] - fl.x, nib[1] - fl.y) < 26 * S;
      q.dripT -= dt * (1 + Math.min(2, Math.hypot(q.vx, q.vy) / (900 * S)));
      if (over && q.dripT > 0.9) q.dripT = 0.5 + R() * 0.5;
      if (q.dripT <= 0 && (q.ink > 0 || over)) {
        spawnDrop(nib[0], nib[1], q.z);
        q.ink = Math.max(0, q.ink - 1);
        q.dripT = 0.45 + R() * 1.1;
      }
    }
  }

  function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vz -= 7 * dt; d.z += d.vz * dt;
      if (d.z <= 0) {
        drops.splice(i, 1);
        if (d.wax) continue;
        const fl = flamePos();
        if (candle.lit && Math.hypot(d.x - fl.x, d.y - fl.y) < 22 * S) { extinguishByDrop(); continue; }
        const sh = objs.slice().reverse().find(function (o) { return o.kind === 'sheet' && o.alive && o.state !== 'plane' && !o.burn && inRect(o, d.x, d.y); });
        addStain(d.x, d.y, d.r * (1.6 + R()), sh, 6);
        sfx.splat();
      }
    }
    for (let i = stains.length - 1; i >= 0; i--) {
      const st = stains[i];
      st.t += dt;
      if (st.puddle) { if (!st.fade) st.grow = Math.min(1, st.grow + dt / 1.8); else st.life2 = (st.life2 || 0) + dt; if (st.life2 > 25) stains.splice(i, 1); continue; }
      if (st.sheet && !st.sheet.alive) { stains.splice(i, 1); continue; }
      if (st.t > st.life) stains.splice(i, 1);
    }
  }

  /* --- papier qui roussit puis brûle --- */
  function updateBurn(dt) {
    const fl = flamePos();
    let fire = 0;
    objs.forEach(function (o) {
      if (o.kind !== 'sheet' || !o.alive || o.state === 'plane') return;
      if (!o.burn) {
        const l = toLocal(o, fl.x, fl.y);
        const over = candle.lit && Math.abs(l[0]) < o.w / 2 - 3 * S && Math.abs(l[1]) < o.h / 2 - 3 * S;
        if (over) { o.heat += dt; o.hx = l[0]; o.hy = l[1]; if (R() < dt * 8) sfx.crackle(0.05); if (R() < dt * 6) spawnSmoke(fl.x, fl.y, 1.5); }
        else o.heat = Math.max(0, o.heat - dt * 0.5);
        if (o.heat > 2.2) ignite(o, o.hx, o.hy);
      } else {
        const b = o.burn;
        b.t += dt;
        fire = Math.max(fire, 1);
        if (b.t > b.maxT) { o.alive = false; for (let i = 0; i < 26; i++) ash.push({ x: o.x + (R() - 0.5) * o.w * 0.8, y: o.y + (R() - 0.5) * o.h * 0.8, a: R() * TAU, s: (2 + R() * 5) * S, t: 0, life: 6 + R() * 4 }); }
        if (R() < dt * 14) sfx.crackle(0.12);
      }
    });
    AU.loop('fire', fire * 0.9);
  }

  function ignite(o, ix0, iy0) {
    const gw = 40, gh = 54;
    const N = Art.Noise(Math.floor(R() * 9999) + 1);
    const thr = new Float32Array(gw * gh);
    const speed = 30 * S;
    let maxT = 0;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const lx0 = (i / (gw - 1) - 0.5) * o.w, ly0 = (j / (gh - 1) - 0.5) * o.h;
      const t = Math.hypot(lx0 - ix0, ly0 - iy0) / speed + (N.fbm(i * 0.15, j * 0.15, 3) + 0.5) * 1.6;
      thr[j * gw + i] = t; maxT = Math.max(maxT, t);
    }
    o.burn = { t: 0, thr: thr, gw: gw, gh: gh, maxT: maxT + 0.6, mask: Art.canvas(gw, gh), char: Art.canvas(gw, gh), glow: Art.canvas(gw, gh), comp: Art.canvas(o.w * dpr, o.h * dpr) };
    if (o.state === 'placed') o.state = 'free';
    if (stage.s === 'quill' && !objs.some(function (s) { return s !== o && s.kind === 'sheet' && s.alive && s.state === 'placed' && !s.burn; })) stage.s = 'sheet';
    sfx.ignite();
  }

  function updateParticles(dt) {
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.t += dt;
      p.vx += (Math.sin(p.ph + p.t * 3) * 14 * S + candle.wind.x * 60 * S) * dt;
      p.vy += -6 * S * dt;
      p.vx *= Math.exp(-0.8 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += 9 * S * dt;
      if (p.t > p.life) smoke.splice(i, 1);
    }
    for (let i = flames.length - 1; i >= 0; i--) {
      const f = flames[i];
      f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 40 * S * dt;
      if (f.t > f.life) flames.splice(i, 1);
    }
    for (let i = ash.length - 1; i >= 0; i--) { ash[i].t += dt; if (ash[i].t > ash[i].life) ash.splice(i, 1); }
    actors.forEach(function (a) { if (a.update) a.update(dt); });
  }

  /* ============ rendu ============ */
  function render() {
    const x = wx;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.drawImage(tex.wood, 0, 0, W, H);
    // sous-main
    const b = L.blot;
    shadow(x, b.x, b.y, 0.08, 0.9, function (c) { c.drawImage(tex.leather, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); });
    x.drawImage(tex.leather, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    // carte-titre posée sur le bureau
    drawNote(x);
    // taches sur la table
    stains.forEach(function (st) { if (!st.sheet) drawStain(x, st); });
    ash.forEach(function (a) {
      const al = 1 - a.t / a.life;
      x.save(); x.translate(a.x, a.y); x.rotate(a.a); x.fillStyle = 'rgba(25,20,18,' + (0.7 * al) + ')';
      x.fillRect(-a.s / 2, -a.s / 3, a.s, a.s * 0.66); x.restore();
    });
    // pile de parchemins
    const st = tex.stack;
    shadow(x, L.stack.x, L.stack.y, 0.12, 1, function (c) { c.drawImage(st.img, L.stack.x - L.sheetW / 2 - st.pad, L.stack.y - L.sheetH / 2 - st.pad, L.sheetW + st.pad * 2, L.sheetH + st.pad * 2); });
    x.drawImage(st.img, L.stack.x - L.sheetW / 2 - st.pad, L.stack.y - L.sheetH / 2 - st.pad, L.sheetW + st.pad * 2, L.sheetH + st.pad * 2);
    drawWell(x);
    drawCandleBody(x);
    // feuilles, carte, dé, plume (plume dans l'encrier dessinée avec l'encrier)
    objs.forEach(function (o) { if (!o.held && o.alive && o.state !== 'well') drawObj(x, o); });
    actors.slice().sort(function (a, b2) { return (a.zi || 0) - (b2.zi || 0); }).forEach(function (a) { if (a.draw) a.draw(x); });
    if (quill && quill.state === 'well') drawQuillInWell(x);
    if (pointer.held) drawObj(x, pointer.held);
    // gouttes en chute
    drops.forEach(function (d) {
      x.fillStyle = d.wax ? 'rgba(150,28,22,.95)' : 'rgba(8,6,14,.9)'; x.beginPath(); x.ellipse(d.x, d.y - d.z * 4 * S, d.r * 0.8, d.r * 1.15, 0, 0, TAU); x.fill();
    });
    // fumée
    smoke.forEach(function (p) {
      const al = Math.sin(Math.PI * Math.min(1, p.t / p.life)) * 0.2;
      const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, 'rgba(225,220,215,' + al + ')'); g.addColorStop(1, 'rgba(225,220,215,0)');
      x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r, 0, TAU); x.fill();
    });
    renderLight();
    renderFx();
  }

  function drawNote(x) {
    const n = tex.note;
    const d = function (c) { c.save(); c.translate(L.note.x, L.note.y); c.rotate(-0.025); c.drawImage(n.img, -n.w / 2, -n.h / 2, n.w, n.h); c.restore(); };
    shadow(x, L.note.x, L.note.y, 0.06, 1, d);
    d(x);
  }

  function drawWell(x) {
    const t = tex.well, s = 130 * S / (130 * S);
    const w = t.img.width / t.k, h = t.img.height / t.k;
    const ox = L.well.x - t.cx * s, oy = L.well.y - t.cy * s;
    shadow(x, L.well.x, L.well.y, 0.25, 1, function (c) { c.drawImage(t.img, ox, oy, w, h); });
    x.drawImage(t.img, ox, oy, w, h);
  }

  function drawCandleBody(x) {
    const t = tex.candle;
    const w = t.img.width / t.k, h = t.img.height / t.k;
    const ox = L.candle.x - t.cx, oy = L.candle.y - t.cy;
    shadow(x, L.candle.x, L.candle.y, 0.1, 0.8, function (c) { c.drawImage(t.img, ox, oy, w, h); });
    x.drawImage(t.img, ox, oy, w, h);
    Art.drawCandle(x, L.candle.x, L.candle.y, L.candleR, L.candleH, candle.lit);
  }

  function drawQuillInWell(x) {
    const g = quillWellGeom();
    const q = tex.quill, k = q.k;
    // ombre allongée de la plume dressée
    const sp = shadowParams(L.well.x, L.well.y, 0.3);
    const sa = Math.atan2(sp.dy, sp.dx);
    x.save(); x.globalAlpha = 0.45 * candle.light + 0.15;
    shadow(x, g.nx, g.ny, 0.5, 1, function (c) { c.save(); c.translate(g.nx - sp.dx, g.ny - sp.dy); c.rotate(sa + Math.PI / 2); c.scale(0.5, 0.75); c.drawImage(q.img, -q.nibX, -q.nibY, q.w, q.h); c.restore(); });
    x.restore();
    x.save(); x.translate(g.nx, g.ny); x.rotate(g.a + Math.PI / 2); x.scale(1, g.len / L.quillL);
    x.drawImage(q.img, -q.nibX, -q.nibY, q.w, q.h);
    x.restore();
  }

  function drawObj(x, o) {
    if (o.kind === 'die') {
      const t = tex.dice[o.face || 20], w = t.img.width / t.k, h = t.img.height / t.k;
      // pendant la roulade, la face « bascule » : léger écrasement + grossit en l'air
      const tum = o.rolling ? Math.abs(Math.cos(o.tumble * Math.PI)) : 1;
      const sx = 0.72 + 0.28 * tum, sc = 1 + o.z * 0.12;
      const d = function (c) { c.save(); c.translate(o.x, o.y); c.rotate(o.a); c.scale(sx * sc, (0.9 + 0.1 * tum) * sc); c.drawImage(t.img, -w / 2, -h / 2, w, h); c.restore(); };
      shadow(x, o.x, o.y, o.z + 0.12, 1, d); d(x);
      return;
    }
    if (o.kind === 'quill') return drawQuill(x, o);
    if (o.kind === 'sheet') return o.state === 'plane' ? drawPlane(x, o) : drawSheet(x, o);
  }

  function drawQuill(x, o) {
    const q = tex.quill;
    const sc = 1 + o.z * 0.05;
    const drawIt = function (c) { c.save(); c.translate(o.x, o.y); c.rotate(o.a + Math.PI / 2); c.scale(sc, sc); c.drawImage(q.img, -q.nibX, -q.nibY + o.w / 2, q.w, q.h); c.restore(); };
    shadow(x, o.x, o.y, o.z + 0.05, 0.75, drawIt);
    drawIt(x);
  }

  function sheetImage(o) {
    if (!o.burn && !o.ink && !o.heat) return o.tex;
    const b = o.burn;
    const comp = (b && b.comp) || o.comp || (o.comp = Art.canvas(o.w * dpr, o.h * dpr));
    const c = comp.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'copy'; c.drawImage(o.tex, 0, 0, comp.width, comp.height);
    c.globalCompositeOperation = 'source-over';
    if (o.ink) c.drawImage(o.ink, 0, 0, comp.width, comp.height);
    if (o.heat > 0.05 && !b) {
      const px = (o.hx + o.w / 2) * dpr, py = (o.hy + o.h / 2) * dpr, r = (10 + o.heat * 16) * S * dpr;
      const g = c.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(70,30,5,' + Math.min(0.85, o.heat / 2) + ')'); g.addColorStop(0.5, 'rgba(120,70,20,' + Math.min(0.45, o.heat / 4) + ')'); g.addColorStop(1, 'rgba(150,100,40,0)');
      c.fillStyle = g; c.fillRect(0, 0, comp.width, comp.height);
    }
    if (b) {
      const mx = b.mask.getContext('2d'), cx0 = b.char.getContext('2d'), gx0 = b.glow.getContext('2d');
      const mi = mx.createImageData(b.gw, b.gh), ci = cx0.createImageData(b.gw, b.gh), gi = gx0.createImageData(b.gw, b.gh);
      let front = [];
      for (let i = 0; i < b.thr.length; i++) {
        const d = b.thr[i] - b.t;           // > 0 : pas encore brûlé
        mi.data[i * 4 + 3] = clamp(d * 6, 0, 1) * 255;
        const ch = clamp(1 - d / 1.1, 0, 1);
        ci.data[i * 4] = 28; ci.data[i * 4 + 1] = 14; ci.data[i * 4 + 2] = 6; ci.data[i * 4 + 3] = ch * 245;
        const gl = d > -0.05 && d < 0.3 ? 1 - Math.abs(d - 0.1) / 0.25 : 0;
        gi.data[i * 4] = 255; gi.data[i * 4 + 1] = 120 + gl * 80; gi.data[i * 4 + 2] = 30; gi.data[i * 4 + 3] = clamp(gl, 0, 1) * 255;
        if (gl > 0.6 && R() < 0.06) front.push(i);
      }
      mx.putImageData(mi, 0, 0); cx0.putImageData(ci, 0, 0); gx0.putImageData(gi, 0, 0);
      c.imageSmoothingEnabled = true;
      c.globalCompositeOperation = 'source-atop'; c.drawImage(b.char, 0, 0, comp.width, comp.height);
      c.globalCompositeOperation = 'destination-in'; c.drawImage(b.mask, 0, 0, comp.width, comp.height);
      c.globalCompositeOperation = 'source-over';
      // flammes le long du front
      front.slice(0, 6).forEach(function (i) {
        const gx1 = i % b.gw, gy1 = Math.floor(i / b.gw);
        const p = toWorld(o, (gx1 / (b.gw - 1) - 0.5) * o.w, (gy1 / (b.gh - 1) - 0.5) * o.h);
        flames.push({ x: p[0], y: p[1], vx: (R() - 0.5) * 20 * S, vy: -(20 + R() * 40) * S, t: 0, life: 0.35 + R() * 0.4, s: (6 + R() * 10) * S });
        if (R() < 0.15) spawnSmoke(p[0], p[1], 2.2);
      });
    }
    return comp;
  }

  function drawSheet(x, o) {
    const img = sheetImage(o);
    const sc = 1 + o.z * 0.035;
    const drawIt = function (c) { c.save(); c.translate(o.x, o.y); c.rotate(o.a); c.scale(sc, sc); c.drawImage(img, -o.w / 2, -o.h / 2, o.w, o.h); c.restore(); };
    shadow(x, o.x, o.y, o.z, 0.85, drawIt);
    drawIt(x);
    // taches sur la feuille
    stains.forEach(function (st) {
      if (st.sheet !== o) return;
      const p = toWorld(o, st.lx * sc, st.ly * sc);
      st.x = p[0]; st.y = p[1];
      drawStain(x, st);
    });
    // lueur du front de flamme (sur la couche fx)
    if (o.burn) { o._glow = true; }
  }

  function drawStain(x, st) {
    let al = 0.88;
    if (!st.puddle) al *= clamp((st.life - st.t) / 2, 0, 1) * clamp(st.t / 0.08, 0, 1);
    else if (st.fade) al *= clamp(1 - (st.life2 || 0) / 25, 0, 1);
    const r = st.puddle ? st.max * easeOut(st.grow) : st.r;
    if (r <= 0.2) return;
    x.save();
    x.fillStyle = 'rgba(10,8,22,' + al + ')';
    Art.blobPath(x, st.x, st.y, r, st.seed, st.puddle ? 0.28 : 0.22); x.fill();
    st.sat.forEach(function (s) { x.beginPath(); x.arc(st.x + s[0] * (st.puddle ? 0.6 : 1), st.y + s[1] * (st.puddle ? 0.6 : 1), s[2] * (st.puddle ? 1.5 : 1), 0, TAU); x.fill(); });
    x.fillStyle = 'rgba(160,150,200,' + (0.18 * al) + ')';
    x.beginPath(); x.ellipse(st.x - r * 0.3, st.y - r * 0.35, r * 0.28, r * 0.12, -0.5, 0, TAU); x.fill();
    x.restore();
  }

  /* --- avion en papier : la feuille se plie en vol --- */
  function drawPlane(x, o) {
    const f = easeInOut(o.fold);
    const w = o.w, h = o.h;
    const Lp = h * 0.9;
    const rectPts = [[-w / 2, -h / 2], [0, -h / 2], [w / 2, -h / 2], [w / 2, 0], [w / 2, h / 2], [0, h / 2], [-w / 2, h / 2], [-w / 2, 0]];
    const planePts = [[-0.02 * Lp, -0.5 * Lp], [0, -0.53 * Lp], [0.02 * Lp, -0.5 * Lp], [0.34 * Lp, 0.42 * Lp], [0.05 * Lp, 0.36 * Lp], [0, 0.47 * Lp], [-0.05 * Lp, 0.36 * Lp], [-0.34 * Lp, 0.42 * Lp]];
    const roll = o.fold >= 1 ? Math.sin(o.flyT * 3.2) * 0.45 : 0;
    const sc = 1 + Math.max(0, o.z - 1) * 0.12;
    const pts = rectPts.map(function (p, i) { return [lerp(p[0], planePts[i][0], f) * Math.cos(roll) * sc, lerp(p[1], planePts[i][1], f) * sc]; });
    const path = function (c) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
    shadow(x, o.x, o.y, Math.min(4, o.z), 0.8, function (c) { c.save(); c.translate(o.x, o.y); c.rotate(o.a); path(c); c.fillStyle = '#000'; c.fill(); c.restore(); });
    x.save(); x.translate(o.x, o.y); x.rotate(o.a);
    path(x); x.save(); x.clip(); x.drawImage(o.tex, -w / 2 * sc, -h / 2 * sc, w * sc, h * sc);
    // une aile dans l'ombre, l'autre dans la lumière, et le pli central
    x.fillStyle = 'rgba(60,40,20,' + (0.22 * f + Math.max(0, roll) * 0.25) + ')';
    x.beginPath(); x.moveTo(pts[1][0], pts[1][1]); x.lineTo(pts[3][0], pts[3][1]); x.lineTo(pts[4][0], pts[4][1]); x.lineTo(pts[5][0], pts[5][1]); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,245,220,' + (0.12 * f + Math.max(0, -roll) * 0.2) + ')';
    x.beginPath(); x.moveTo(pts[1][0], pts[1][1]); x.lineTo(pts[7][0], pts[7][1]); x.lineTo(pts[6][0], pts[6][1]); x.lineTo(pts[5][0], pts[5][1]); x.closePath(); x.fill();
    x.restore();
    x.strokeStyle = 'rgba(70,50,30,' + (0.5 * f) + ')'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(pts[1][0], pts[1][1]); x.lineTo(pts[5][0], pts[5][1]); x.stroke();
    x.restore();
  }

  /* --- lumière : multiplie toute la page (bureau ET lettre) --- */
  function renderLight() {
    const c = lx, k = LIGHT_K;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    const lit = candle.light;
    const amb = [lerp(16, 30, lit), lerp(18, 22, lit), lerp(28, 18, lit)];
    c.fillStyle = 'rgb(' + (amb[0] | 0) + ',' + (amb[1] | 0) + ',' + (amb[2] | 0) + ')';
    c.fillRect(0, 0, light.width, light.height);
    c.globalCompositeOperation = 'lighter';
    // clair de lune très faible (en haut à gauche)
    const mg = c.createRadialGradient(0, 0, 0, 0, 0, light.width * 0.9);
    mg.addColorStop(0, 'rgba(40,48,70,.6)'); mg.addColorStop(1, 'rgba(40,48,70,0)');
    c.fillStyle = mg; c.fillRect(0, 0, light.width, light.height);
    if (lit > 0.01) {
      const fl = flamePos();
      const flick = 0.93 + 0.05 * Math.sin(now * 13.1) + 0.03 * Math.sin(now * 23.7 + 1) + 0.025 * Math.sin(now * 5.3);
      const I = lit * flick * (1 - Math.min(0.25, Math.hypot(candle.lean.x, candle.lean.y) * 0.2));
      const Rr = Math.hypot(W, H) * 0.95 * k;
      const g = c.createRadialGradient(fl.x * k, fl.y * k, 0, fl.x * k, fl.y * k, Rr);
      g.addColorStop(0, 'rgba(255,238,205,' + I + ')');
      g.addColorStop(0.12, 'rgba(250,215,165,' + (0.95 * I) + ')');
      g.addColorStop(0.4, 'rgba(215,165,110,' + (0.78 * I) + ')');
      g.addColorStop(0.7, 'rgba(160,110,70,' + (0.5 * I) + ')');
      g.addColorStop(1, 'rgba(90,60,40,' + (0.15 * I) + ')');
      c.fillStyle = g; c.fillRect(0, 0, light.width, light.height);
    }
    // les feuilles qui brûlent éclairent aussi
    objs.forEach(function (o) {
      if (!o.burn || !o.alive) return;
      const r = 260 * S * k;
      const g = c.createRadialGradient(o.x * k, o.y * k, 0, o.x * k, o.y * k, r);
      g.addColorStop(0, 'rgba(255,170,90,.75)'); g.addColorStop(1, 'rgba(255,140,60,0)');
      c.fillStyle = g; c.fillRect(0, 0, light.width, light.height);
    });
    actors.forEach(function (a) { if (a.light) a.light(c, k); });
  }

  /* --- flamme, braises, feu : couche additive --- */
  function renderFx() {
    const c = fxx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    const fl = flamePos();
    const wick = { x: L.candle.x + L.candleR * 0.12, y: L.candle.y - L.candleH - L.candleR * 0.55 };
    if (candle.size > 0.01) {
      const s = candle.size;
      const flick = Math.sin(now * 17) * 0.06 + Math.sin(now * 29 + 2) * 0.04 + (R() - 0.5) * 0.05;
      const lean = candle.lean;
      const hgt = 34 * S * s * (1 + flick) * (1 - Math.min(0.4, Math.hypot(lean.x, lean.y) * 0.25));
      const tipX = wick.x + lean.x * 26 * S * s + Math.sin(now * 7) * 1.2 * S, tipY = wick.y - hgt + lean.y * 10 * S;
      // halo
      const halo = c.createRadialGradient(wick.x, wick.y - hgt * 0.4, 0, wick.x, wick.y - hgt * 0.4, 110 * S * s);
      halo.addColorStop(0, 'rgba(255,170,80,' + (0.35 * s) + ')'); halo.addColorStop(0.35, 'rgba(255,120,40,' + (0.1 * s) + ')'); halo.addColorStop(1, 'rgba(255,100,30,0)');
      c.fillStyle = halo; c.beginPath(); c.arc(wick.x, wick.y - hgt * 0.4, 110 * S * s, 0, TAU); c.fill();
      const tear = function (wd, hScale, col0, col1) {
        const bx = wick.x, by = wick.y + 3 * S * s;
        const tx = lerp(bx, tipX, hScale), ty = lerp(by, tipY, hScale);
        const mx = lerp(bx, tx, 0.42) + lean.x * 4 * S, my = lerp(by, ty, 0.42);
        const g = c.createRadialGradient(lerp(bx, tx, 0.3), lerp(by, ty, 0.3), 0, lerp(bx, tx, 0.35), lerp(by, ty, 0.35), Math.hypot(tx - bx, ty - by) * 0.75);
        g.addColorStop(0, col0); g.addColorStop(1, col1);
        c.fillStyle = g;
        c.beginPath(); c.moveTo(tx, ty);
        c.bezierCurveTo(mx + wd, my - 2 * S, bx + wd * 0.9, by - 2 * S, bx, by);
        c.bezierCurveTo(bx - wd * 0.9, by - 2 * S, mx - wd, my - 2 * S, tx, ty);
        c.fill();
      };
      tear(11 * S * s, 1, 'rgba(255,140,45,.7)', 'rgba(255,80,20,0)');
      tear(7.5 * S * s, 0.86, 'rgba(255,215,140,.9)', 'rgba(255,160,60,.08)');
      tear(4.5 * S * s, 0.6, 'rgba(255,252,235,.95)', 'rgba(255,230,180,.25)');
      c.fillStyle = 'rgba(70,110,255,' + (0.35 * s) + ')'; c.beginPath(); c.ellipse(wick.x, wick.y + 1 * S, 3.5 * S * s, 2.4 * S * s, 0, 0, TAU); c.fill();
    }
    if (!candle.lit && candle.ember > 0) {
      c.fillStyle = 'rgba(255,90,30,' + (candle.ember * (0.6 + R() * 0.4)) + ')';
      c.beginPath(); c.arc(wick.x, wick.y, 1.8 * S, 0, TAU); c.fill();
    }
    // lueur des fronts de flamme et flammèches
    objs.forEach(function (o) {
      if (!o.burn || !o.alive) return;
      c.save(); c.translate(o.x, o.y); c.rotate(o.a);
      c.globalAlpha = 0.9; c.drawImage(o.burn.glow, -o.w / 2, -o.h / 2, o.w, o.h); c.restore();
    });
    flames.forEach(function (f) {
      const k2 = 1 - f.t / f.life;
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.s);
      g.addColorStop(0, 'rgba(255,230,160,' + (0.8 * k2) + ')'); g.addColorStop(0.4, 'rgba(255,130,40,' + (0.5 * k2) + ')'); g.addColorStop(1, 'rgba(255,80,20,0)');
      c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, f.s, 0, TAU); c.fill();
    });
    actors.forEach(function (a) { if (a.fx) a.fx(c); });
    objs.forEach(function (o) {
      if (o.kind !== 'die' || o.rolling || o.face !== 20 || !dieLabel || !dieLabel.classList.contains('is-on')) return;
      const g = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, 40 * S);
      g.addColorStop(0, 'rgba(255,210,120,' + (0.35 + 0.15 * Math.sin(now * 10)) + ')'); g.addColorStop(1, 'rgba(255,180,80,0)');
      c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y, 40 * S, 0, TAU); c.fill();
    });
    c.globalCompositeOperation = 'source-over';
  }

  /* ============ aides fléchées ============ */
  const hintBox = document.createElement('div'); hintBox.className = 'hint'; hintBox.setAttribute('role', 'status');
  ui.appendChild(hintBox);
  const hintPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const hintHead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hintSvg.appendChild(hintPath); hintSvg.appendChild(hintHead);

  function hintTarget(id) {
    if (id === 'stack') return { x: L.stack.x, y: L.stack.y, r: L.sheetH * 0.55 };
    if (id === 'blot') return { x: L.blot.x, y: L.blot.y, r: Math.min(L.blot.w, L.blot.h) * 0.3 };
    if (id === 'well') return { x: L.well.x, y: L.well.y - 40 * S, r: 70 * S };
    if (id === 'sheet') { const s = objs.find(function (o) { return o.kind === 'sheet' && o.alive && o.state === 'placed'; }); return s ? { x: s.x, y: s.y, r: s.h * 0.5 } : null; }
    if (id === 'candle') return { x: L.candle.x, y: L.candle.y - L.candleH * 0.6, r: 60 * S };
    return null;
  }
  const HINTS = {
    stack: function () { return T('hintStack', 'Attrape une feuille et fais-la glisser jusqu’au sous-main en cuir'); },
    blot: function () { return T('hintBlot', 'Pose la feuille ici, au milieu du sous-main — ailleurs, elle s’envole'); },
    well: function () { return T('hintWell', 'Sors la plume de l’encrier et emmène-la jusqu’à ta feuille'); },
    sheet: function () { return T('hintSheet', 'Lâche la plume sur la feuille pour commencer à écrire'); }
  };
  function showHint(id) {
    if (stage.hint === id) return;
    stage.hint = id;
    hintBox.textContent = HINTS[id]();
    hintBox.classList.add('is-on'); hintSvg.classList.add('is-on');
    hintPath.style.animation = 'none'; void hintPath.getBoundingClientRect(); hintPath.style.animation = '';
    sfx.scratch(); setTimeout(sfx.scratch, 120);
  }
  function hideHint() { stage.hint = null; hintBox.classList.remove('is-on'); hintSvg.classList.remove('is-on'); }

  function updateHints(dt) {
    if (mode !== 'intro') { if (stage.hint) hideHint(); return; }
    if (!pointer.held) stage.idle += dt;
    let want = null;
    if (stage.s === 'sheet') {
      if (stage.planes >= 2) want = 'blot';
      else if (stage.stackClicks >= 2 || stage.idle > 11) want = 'stack';
    } else if (stage.s === 'quill') {
      if (stage.quillWrong >= 2) want = 'sheet';
      else if (stage.wellClicks >= 2 || stage.idle > 11) want = 'well';
    }
    if (pointer.held && want !== 'blot' && want !== 'sheet') want = null;
    if (want !== stage.hint) { if (want) showHint(want); else if (stage.hint) hideHint(); }
    if (stage.hint) placeHint();
  }

  function placeHint() {
    const t = hintTarget(stage.hint);
    if (!t) { hideHint(); return; }
    // le texte se place du côté le plus dégagé de l'écran
    let vx = W / 2 - t.x, vy = H * 0.45 - t.y;
    if (Math.hypot(vx, vy) < 40) { vx = 0; vy = -1; }
    const d = Math.hypot(vx, vy); vx /= d; vy /= d;
    const dist = t.r + 120 * S;
    let ax = t.x + vx * dist, ay = t.y + vy * dist;
    const bw = hintBox.offsetWidth, bh = hintBox.offsetHeight;
    ax = clamp(ax, bw / 2 + 12, W - bw / 2 - 12); ay = clamp(ay, bh / 2 + 12, H - bh / 2 - 12);
    hintBox.style.transform = 'translate(' + (ax - bw / 2) + 'px,' + (ay - bh / 2) + 'px)';
    // flèche courbe tracée à l'encre, du texte vers la cible
    const off = Math.min(Math.abs(vx) > 1e-3 ? (bw / 2) / Math.abs(vx) : 1e9, Math.abs(vy) > 1e-3 ? (bh / 2) / Math.abs(vy) : 1e9) + 8;
    const sx = ax - vx * off, sy = ay - vy * off;
    const ex = t.x + vx * t.r * 0.55, ey = t.y + vy * t.r * 0.55;
    const mx = (sx + ex) / 2 + (-vy) * 40 * S, my = (sy + ey) / 2 + vx * 40 * S;
    hintPath.setAttribute('d', 'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1));
    const ang = Math.atan2(ey - my, ex - mx), hl = 13 * S;
    const h1 = [ex - Math.cos(ang - 0.45) * hl, ey - Math.sin(ang - 0.45) * hl], h2 = [ex - Math.cos(ang + 0.45) * hl, ey - Math.sin(ang + 0.45) * hl];
    hintHead.setAttribute('d', 'M' + h1[0].toFixed(1) + ' ' + h1[1].toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1) + ' L' + h2[0].toFixed(1) + ' ' + h2[1].toFixed(1));
  }

  /* ============ séquence d'envoi ============ */
  function writtenSheet(w, h, name) {
    const c = Art.canvas(w * dpr, h * dpr), x = c.getContext('2d');
    x.drawImage(Art.paper(w * dpr, h * dpr, { seed: 909, scale: dpr, spots: 2, edge: 10 }), 0, 0);
    x.scale(dpr, dpr);
    x.strokeStyle = 'rgba(20,12,22,.8)'; x.lineCap = 'round'; x.lineJoin = 'round';
    const N = Art.Noise(5);
    for (let li = 0; li < 11; li++) {
      const y = h * (0.13 + li * 0.062);
      const end = li === 0 ? 0.55 : li % 4 === 3 ? 0.6 : 0.86;
      x.lineWidth = 0.9 * S;
      x.beginPath();
      let first = true;
      for (let t = 0.12; t < end; t += 0.004) {
        if (N.n2(t * 30, li) > 0.35) { first = true; continue; }   // espaces entre les mots
        const px = w * t, py = y + Math.sin(t * 210 + li) * 1.6 * S + N.n2(t * 50, li * 3) * 1.4 * S;
        if (first) { x.moveTo(px, py); first = false; } else x.lineTo(px, py);
      }
      x.stroke();
    }
    x.fillStyle = 'rgba(30,14,16,.9)';
    x.font = (h * 0.075) + 'px "Pinyon Script", cursive';
    x.textAlign = 'right';
    x.fillText(name || '', w * 0.88, h * 0.9);
    return c;
  }

  function caption(text) {
    let el = ui.querySelector('.desk-caption');
    if (!el) { el = document.createElement('p'); el.className = 'desk-caption'; el.setAttribute('aria-live', 'polite'); ui.appendChild(el); }
    el.textContent = text || '';
    el.classList.toggle('is-on', !!text);
  }

  async function playSend(answers, sending, name) {
    mode = 'send';
    hideHint();
    const cx = L.blot.x, cy = L.blot.y;
    const sw = L.sheetW * 1.12, sh = L.sheetH * 1.12;
    const letterTex = writtenSheet(sw, sh, name);
    const backTex = Art.paper(sw * dpr, sh * dpr, { seed: 910, scale: dpr, tone: [222, 208, 178], spots: 1, edge: 10 });

    /* --- la lettre se pose et se plie en trois --- */
    const lt = { zi: 2, x: cx, y: cy - 40 * S, a: -0.02, z: 1.4, alpha: 0, f1: 0, f2: 0, scale: 1, clipEnv: null };
    lt.draw = function (x) { drawFolding(x, lt, letterTex, backTex, sw, sh); };
    actors.push(lt);
    await tween(0.35, function (t) { lt.alpha = t; }, easeOut);
    await tween(0.55, function (t) { lt.z = lerp(1.4, 0, t); lt.y = lerp(cy - 40 * S, cy - 10 * S, t); lt.a = lerp(-0.02, 0, t); }, easeIn);
    sfx.paperDrop();
    await wait(0.25);
    sfx.crease(8);
    await tween(0.6, function (t) { lt.f1 = t; }, easeInOut);
    sfx.crease(8);
    await tween(0.6, function (t) { lt.f2 = t; }, easeInOut);
    await wait(0.2);

    /* --- l'enveloppe glisse depuis la gauche, la lettre entre dedans --- */
    const ew = sw * 1.12, eh = sh / 3 * 1.4;
    const env = { zi: 1, x: -ew, y: cy + 30 * S, a: 0.04, z: 0, flap: 0, w: ew, h: eh, seal: null, alpha: 1 };
    env.draw = function (x) { drawEnvelope(x, env, 'back'); };
    const envFront = { zi: 3, draw: function (x) { drawEnvelope(x, env, 'front'); } };
    actors.push(env, envFront);
    sfx.slide(0.6);
    await tween(0.75, function (t) { env.x = lerp(-ew, cx, t); env.a = lerp(0.12, 0, t); }, easeOut);
    sfx.paperGrab();
    const ly0 = lt.y;
    await tween(0.8, function (t) { lt.y = lerp(ly0, env.y + eh * 0.12, t); lt.scale = lerp(1, 0.9, t); }, easeInOut);
    sfx.crease(5);
    await tween(0.55, function (t) { env.flap = t; }, easeInOut);
    actors.splice(actors.indexOf(lt), 1);

    /* --- cire chauffée à la bougie, coulée, puis cachet --- */
    if (!candle.lit) { toggleCandle(true); await wait(0.7); }
    const fl0 = flamePos();
    const wax = { zi: 6, x: W + 120 * S, y: fl0.y + 60 * S, a: -2.5, z: 1.5, heat: 0 };
    wax.draw = function (x) { drawWaxStick(x, wax); };
    wax.fx = function (c) { if (wax.heat > 0) { const tip = waxTip(wax); const g = c.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 9 * S); g.addColorStop(0, 'rgba(255,120,60,' + (0.6 * wax.heat) + ')'); g.addColorStop(1, 'rgba(255,60,20,0)'); c.fillStyle = g; c.beginPath(); c.arc(tip[0], tip[1], 9 * S, 0, TAU); c.fill(); } };
    actors.push(wax);
    const tipTo = function (px, py) { const tp = waxTip({ x: 0, y: 0, a: wax.a }); return [px - tp[0], py - tp[1]]; };
    let from = [wax.x, wax.y], to = tipTo(fl0.x, fl0.y + 4 * S);
    await tween(0.9, function (t) { wax.x = lerp(from[0], to[0], t); wax.y = lerp(from[1], to[1], t); }, easeInOut);
    for (let i = 0; i < 10; i++) { await wait(0.12); wax.heat = Math.min(1, wax.heat + 0.12); windFrom(fl0.x, fl0.y, (R() - 0.5) * 300, 0, 1); if (i % 3 === 0) sfx.sizzle(); }
    from = [wax.x, wax.y]; to = tipTo(env.x + 2 * S, env.y + eh * 0.02 - 10 * S);
    await tween(0.85, function (t) { wax.x = lerp(from[0], to[0], t); wax.y = lerp(from[1], to[1], t); wax.a = lerp(-2.5, -2.2, t); }, easeInOut);
    const seal = { zi: 4, x: env.x, y: env.y + eh * 0.02, r: 24 * S, spread: 0, imprint: false, seed: 13 };
    seal.draw = function (x) {
      if (seal.spread <= 0) return;
      shadow(x, seal.x, seal.y, 0.03, 0.7, function (c) { Art.drawSeal(c, seal.x, seal.y, seal.r, { spread: seal.spread, imprint: seal.imprint, seed: seal.seed, text: T('seal', 'SiS2') }); });
      Art.drawSeal(x, seal.x, seal.y, seal.r, { spread: seal.spread, imprint: seal.imprint, seed: seal.seed, text: T('seal', 'SiS2') });
    };
    actors.push(seal);
    for (let i = 0; i < 4; i++) {
      const tip = waxTip(wax);
      drops.push({ x: tip[0], y: tip[1], z: 0.6, vz: 0, r: 2.6 * S, wax: true });
      sfx.waxDrip();
      await wait(0.28);
      seal.spread = Math.min(1, seal.spread + 0.32);
      wax.heat *= 0.85;
    }
    from = [wax.x, wax.y];
    await tween(0.6, function (t) { wax.x = lerp(from[0], W + 150 * S, t); wax.y = lerp(from[1], from[1] - 80 * S, t); }, easeIn);
    actors.splice(actors.indexOf(wax), 1);

    const stamp = { zi: 7, x: seal.x + 40 * S, y: seal.y - 160 * S, z: 3 };
    stamp.draw = function (x) { drawStamp(x, stamp); };
    actors.push(stamp);
    await tween(0.7, function (t) { stamp.x = lerp(seal.x + 40 * S, seal.x, t); stamp.y = lerp(seal.y - 160 * S, seal.y, t); stamp.z = lerp(3, 0.35, t); }, easeOut);
    await tween(0.12, function (t) { stamp.z = lerp(0.35, 0, t); }, easeIn);
    sfx.stamp(); seal.imprint = true; seal.spread = 1;
    await wait(0.18);
    await tween(0.6, function (t) { stamp.z = lerp(0, 3.2, t); stamp.y = lerp(seal.y, seal.y - 140 * S, t); stamp.x = lerp(seal.x, seal.x + 120 * S, t); }, easeIn);
    actors.splice(actors.indexOf(stamp), 1);
    seal.zi = 4;

    /* --- le pigeon voyageur --- */
    const pg = { zi: 9, x: -160 * S, y: cy - 260 * S, a: 2.2, z: 3, wing: 1, flap: 0, flapRate: 15, head: 0, carry: false, scale: 2.1 };
    pg.update = function (dt) { pg.flap += dt * pg.flapRate; if (pg.wing > 0.3 && pg.z > 0.05) { pg.flapAcc = (pg.flapAcc || 0) + dt * pg.flapRate; if (pg.flapAcc > TAU) { pg.flapAcc -= TAU; sfx.flap(pg.z < 0.6); } } };
    pg.draw = function (x) { drawPigeonActor(x, pg); };
    actors.push(pg);
    const land = { x: env.x - ew * 0.62, y: env.y + 10 * S };
    const start = { x: pg.x, y: pg.y };
    const ctrl = { x: cx - 120 * S, y: cy - 340 * S };
    await tween(1.6, function (t) {
      const u = 1 - t;
      const nx2 = u * u * start.x + 2 * u * t * ctrl.x + t * t * land.x, ny2 = u * u * start.y + 2 * u * t * ctrl.y + t * t * land.y;
      pg.a = Math.atan2(ny2 - pg.y, nx2 - pg.x) + Math.PI / 2;
      pg.x = nx2; pg.y = ny2; pg.z = lerp(3, 0, easeOut(t)); pg.flapRate = lerp(15, 22, t);
    }, linear);
    for (let i = 0; i < 3; i++) sfx.flap(true);
    feather(pg.x, pg.y, 2);
    await tween(0.35, function (t) { pg.wing = 1 - t; pg.a = lerp(pg.a, 1.6, t * 0.5); }, easeOut);
    pg.flapRate = 0;
    sfx.coo();
    // deux sautillements jusqu'à l'enveloppe, la tête qui dodeline
    for (let i = 0; i < 3; i++) {
      const sx = pg.x, sy = pg.y;
      const tx = lerp(land.x, env.x - ew * 0.1, (i + 1) / 3), ty = lerp(land.y, env.y, (i + 1) / 3);
      pg.a += (Math.atan2(ty - sy, tx - sx) + Math.PI / 2 - pg.a) * 0.6;
      await tween(0.16, function (t) { pg.head = Math.sin(t * Math.PI) * 6; }, linear);
      await tween(0.2, function (t) { pg.x = lerp(sx, tx, t); pg.y = lerp(sy, ty, t); pg.z = Math.sin(t * Math.PI) * 0.12; }, easeInOut);
      sfx.thud();
    }
    // le pigeon attend la réponse du serveur
    let res = null;
    sending.then(function (r) { res = r; });
    let waited = 0;
    while (!res) {
      await tween(0.45, function (t) { pg.head = Math.sin(t * Math.PI) * 5; }, linear);
      waited += 0.45;
      if (waited > 1.8 && waited < 2.3) caption(T('animWait', 'Le pigeon attend que la route soit libre…'));
      if (Math.floor(waited / 3) !== Math.floor((waited - 0.45) / 3)) sfx.coo();
    }
    caption('');
    if (!res.ok) {
      // il repart sans la lettre
      sfx.coo();
      pg.wing = 1; pg.flapRate = 22;
      for (let i = 0; i < 3; i++) sfx.flap(true);
      const sx = pg.x, sy = pg.y;
      await tween(1.3, function (t) { pg.x = lerp(sx, -200 * S, t); pg.y = lerp(sy, -200 * S, t); pg.z = lerp(0, 3, t); pg.a = -0.8; }, easeIn);
      actors.length = 0;
      mode = 'letter';
      return res;
    }
    /* --- envol avec l'enveloppe --- */
    sfx.coo();
    await wait(0.4);
    pg.wing = 0; pg.flapRate = 24;
    await tween(0.25, function (t) { pg.wing = t; }, easeOut);
    for (let i = 0; i < 4; i++) sfx.flap(true);
    feather(pg.x, pg.y, 3);
    const sx = pg.x, sy = pg.y, ex0 = env.x, ey0 = env.y;
    actors.splice(actors.indexOf(seal), 1);
    env.carrySeal = seal;
    const dest = { x: W + 260 * S, y: -260 * S };
    await tween(2.1, function (t) {
      const nx2 = lerp(sx, dest.x, easeIn(t)), ny2 = lerp(sy, dest.y, easeIn(t)) - Math.sin(t * Math.PI) * 30 * S;
      pg.a = Math.atan2(ny2 - pg.y, nx2 - pg.x) + Math.PI / 2;
      pg.x = nx2; pg.y = ny2; pg.z = lerp(0, 4, t);
      env.x = lerp(ex0, nx2, Math.min(1, t * 4)); env.y = lerp(ey0, ny2 + 26 * S, Math.min(1, t * 4)); env.z = pg.z * 0.92; env.a = pg.a * 0.3;
    }, linear);
    actors.length = 0;
    feathersOnDesk.forEach(function (f) { actors.push(f); });
    mode = 'done';
    return res;
  }

  function feather(x0, y0, n) {
    for (let i = 0; i < n; i++) {
      const f = Art.feather((14 + R() * 10) * S, Math.floor(R() * 99));
      const o = { zi: 10, x: x0 + (R() - 0.5) * 40 * S, y: y0 + (R() - 0.5) * 30 * S, z: 1.2 + R() * 1.4, a: R() * TAU, va: (R() - 0.5) * 3, ph: R() * TAU, img: f };
      o.update = function (dt) {
        if (o.z > 0) { o.z = Math.max(0, o.z - dt * 0.45); o.ph += dt * 3; o.x += Math.sin(o.ph) * 30 * S * dt; o.y += Math.cos(o.ph * 0.7) * 10 * S * dt + 6 * S * dt; o.a += o.va * dt * (o.z > 0 ? 1 : 0); }
      };
      o.draw = function (x) {
        const sc = 1 + o.z * 0.1;
        const d = function (c) { c.save(); c.translate(o.x, o.y); c.rotate(o.a); c.scale(sc, sc); c.drawImage(o.img.img, -o.img.w / 2, -o.img.h / 2, o.img.w, o.img.h); c.restore(); };
        shadow(x, o.x, o.y, o.z * 0.6, 0.6, d); d(x);
      };
      // les plumes restent sur le bureau après l'envol
      feathersOnDesk.push(o);
      actors.push(o);
    }
  }
  const feathersOnDesk = [];

  function drawFolding(x, lt, tFront, tBack, w, h) {
    x.save(); x.globalAlpha = lt.alpha;
    const sc = (1 + lt.z * 0.04) * lt.scale;
    const panel = function (c, idx, cosA, back) {
      // panneau idx (0 haut, 1 milieu, 2 bas), replié autour de sa charnière
      const top = -h / 2 + idx * h / 3;
      const hinge = idx === 0 ? -h / 6 : idx === 2 ? h / 6 : 0;
      c.save();
      if (idx !== 1) { c.translate(0, hinge); c.scale(1 + 0.08 * Math.sqrt(Math.max(0, 1 - cosA * cosA)), cosA); c.translate(0, -hinge); }
      const src = back ? tBack : tFront;
      c.drawImage(src, 0, (idx * h / 3) * dpr, w * dpr, (h / 3) * dpr, -w / 2, top, w, h / 3);
      if (idx !== 1) { c.fillStyle = back ? 'rgba(60,40,20,' + (0.12 + 0.2 * (1 - Math.abs(cosA))) + ')' : 'rgba(0,0,0,' + (0.25 * (1 - Math.abs(cosA))) + ')'; c.fillRect(-w / 2, top, w, h / 3); }
      c.restore();
    };
    const c1 = Math.cos(lt.f1 * Math.PI), c2 = Math.cos(lt.f2 * Math.PI);
    const drawAll = function (c) {
      c.save(); c.translate(lt.x, lt.y); c.rotate(lt.a); c.scale(sc, sc);
      if (c1 > 0) panel(c, 0, c1, false);
      if (c2 > 0) panel(c, 2, c2, false);
      panel(c, 1, 1, false);
      if (c1 <= 0) panel(c, 0, c1, true);
      if (c2 <= 0) panel(c, 2, c2, true);
      c.restore();
    };
    shadow(x, lt.x, lt.y, lt.z + 0.05, 0.8, drawAll);
    drawAll(x);
    x.restore();
  }

  function drawEnvelope(x, env, part) {
    const draw = function (c) {
      c.save(); c.translate(env.x, env.y); c.rotate(env.a); const sc = 1 + env.z * 0.06; c.scale(sc, sc);
      c.translate(-env.w / 2, -env.h / 2);
      Art.envelope(c, env.w, env.h, tex.envPaper, part, env.flap);
      c.restore();
    };
    if (part === 'back') shadow(x, env.x, env.y, env.z + 0.05, 0.9, function (c) { c.save(); c.translate(env.x, env.y); c.rotate(env.a); c.fillStyle = '#000'; c.fillRect(-env.w / 2, -env.h / 2, env.w, env.h); c.restore(); });
    draw(x);
    if (part === 'front' && env.carrySeal) { const s = env.carrySeal; const sc = 1 + env.z * 0.06; Art.drawSeal(x, env.x, env.y + env.h * 0.02, s.r * sc, { spread: 1, imprint: true, seed: s.seed, text: T('seal', 'SiS2') }); }
  }

  function waxTip(w) { const r = rot(0, -52 * S, w.a); return [w.x + r[0], w.y + r[1]]; }
  function drawWaxStick(x, w) {
    const d = function (c) {
      c.save(); c.translate(w.x, w.y); c.rotate(w.a);
      const g = c.createLinearGradient(-6 * S, 0, 6 * S, 0);
      g.addColorStop(0, '#5a0d0b'); g.addColorStop(0.45, '#a3241e'); g.addColorStop(1, '#4a0a08');
      c.fillStyle = g; c.fillRect(-6 * S, -50 * S, 12 * S, 110 * S);
      c.fillStyle = '#b8322a'; Art.blobPath(c, 0, -50 * S, 6.5 * S, 3, 0.25); c.fill();
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(-2 * S, -46 * S, 2 * S, 100 * S);
      c.restore();
    };
    shadow(x, w.x, w.y, w.z, 0.7, d); d(x);
  }
  function drawStamp(x, s) {
    const sc = 1 + s.z * 0.18;
    const d = function (c) {
      c.save(); c.translate(s.x, s.y); c.scale(sc, sc);
      const b = c.createRadialGradient(-6 * S, -6 * S, 2 * S, 0, 0, 30 * S);
      b.addColorStop(0, '#f2d58c'); b.addColorStop(0.6, '#a07a33'); b.addColorStop(1, '#5c4012');
      c.fillStyle = b; c.beginPath(); c.arc(0, 0, 27 * S, 0, TAU); c.fill();
      const wd = c.createRadialGradient(-5 * S, -7 * S, 1 * S, 0, 0, 20 * S);
      wd.addColorStop(0, '#a8743f'); wd.addColorStop(0.6, '#6b4120'); wd.addColorStop(1, '#3d220e');
      c.fillStyle = wd; c.beginPath(); c.arc(0, -2 * S * s.z, 19 * S, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(30,15,5,.4)'; c.lineWidth = 1; c.beginPath(); c.arc(0, -2 * S * s.z, 12 * S, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,230,180,.2)'; c.beginPath(); c.ellipse(-6 * S, -9 * S - 2 * S * s.z, 6 * S, 3 * S, -0.6, 0, TAU); c.fill();
      c.restore();
    };
    shadow(x, s.x, s.y, s.z, 0.8, d); d(x);
  }
  function drawPigeonActor(x, pg) {
    const sp = shadowParams(pg.x, pg.y, pg.z);
    x.save();
    x.shadowColor = 'rgba(8,4,2,' + (sp.a * 0.8) + ')'; x.shadowBlur = sp.blur * dpr;
    x.shadowOffsetX = (sp.dx + 30000) * dpr; x.shadowOffsetY = sp.dy * dpr;
    x.translate(-30000, 0);
    Art.drawPigeon(x, { x: pg.x, y: pg.y, a: pg.a, wing: pg.wing, flap: pg.flap, head: pg.head, scale: pg.scale }, S, true);
    x.restore();
    Art.drawPigeon(x, { x: pg.x, y: pg.y, a: pg.a, wing: pg.wing, flap: pg.flap, head: pg.head, scale: pg.scale * (1 + pg.z * 0.12) }, S);
  }

  /* ============ API ============ */
  window.Desk = {
    async init(o) {
      Object.assign(opts, o || {});
      document.body.prepend(world);
      document.body.appendChild(light); document.body.appendChild(fx); document.body.appendChild(ui);
      layout();
      try { await Promise.race([document.fonts.load('27px "IM Fell English"').then(function () { return document.fonts.load('12px "IM Fell English SC"'); }), P.sleep(1800)]); } catch (e) { /* polices indisponibles */ }
      buildTextures();
      makeQuill();
      // le dé de la soirée game traîne sur le bureau
      const die = body({ kind: 'die', face: 20, rolling: false, tumble: 0, x: mobile ? W * 0.12 : L.blot.x - L.blot.w / 2 - 90 * S, y: mobile ? H * 0.66 : H * 0.84, a: 0.3, w: 64 * S, h: 64 * S });
      die.I = 400 * S * S; objs.unshift(die);
      mode = 'intro';
      world.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      let rt;
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { layout(); buildTextures(); }, 250); });
      requestAnimationFrame(frame);
    },
    setMode(m) { mode = m; document.documentElement.dataset.deskMode = m; },
    get mode() { return mode; },
    /** Passe l'accueil : la feuille est posée et la plume rangée. */
    skip() { stage.s = 'done'; hideHint(); },
    playSend: playSend,
    caption: caption,
    toggleCandle: toggleCandle,
    candle: candle,
    sfx: sfx,
    layout: L,
    paperDataURL(w, h, seed) { return Art.paper(w, h, { seed: seed || 21, scale: 1, spots: 4, edge: 22 }).toDataURL('image/png'); },
    sealDataURL(size) {
      const c = Art.canvas(size, size), x = c.getContext('2d');
      Art.drawSeal(x, size / 2, size / 2, size * 0.42, { imprint: true, seed: 9, text: T('seal', 'SiS2') });
      return c.toDataURL('image/png');
    },
    quillCursor() {
      const c = Art.canvas(64, 64), x = c.getContext('2d');
      const q = tex.quill;
      x.translate(6, 58); x.rotate(0.62); x.scale(56 / q.h, 56 / q.h);
      x.drawImage(q.img, -q.nibX, -q.nibY, q.w, q.h);
      return c.toDataURL('image/png');
    }
  };

})();
