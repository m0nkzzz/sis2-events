/* ============================================================
 *  Thème « Parchemin » — mise en scène du formulaire
 *  1. Bureau du scribe : prendre un parchemin, tremper la plume
 *  2. La lettre se déroule, signature calligraphiée à la plume
 *  3. Pliage → enveloppe → sceau de cire → pigeon voyageur
 *  4. Copie conforme de la missive
 * ============================================================ */
(function () {
  'use strict';
  const P = window.Platform;
  if (!P) return;
  const EV = P.event, el = P.el, $ = P.$, $$ = P.$$, T = P.text;
  const K = P.reducedMotion ? 0.15 : 1;                 // accélère tout si mouvements réduits
  const wait = function (ms) { return P.sleep(ms * K); };
  const esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  let uid = 0;

  /* ============ Dessins SVG ============ */

  function blobPath(cx, cy, r, bumps, seed) {
    let s = seed || 3;
    const rnd = function () { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; };
    const pts = [];
    for (let i = 0; i < bumps; i++) {
      const a = (i / bumps) * Math.PI * 2;
      const rr = r * (0.9 + rnd() * 0.16);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    let d = '';
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      d += (i === 0 ? 'M' + mx.toFixed(1) + ',' + my.toFixed(1) : '') + ' Q' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' ' +
        ((p1[0] + pts[(i + 2) % pts.length][0]) / 2).toFixed(1) + ',' + ((p1[1] + pts[(i + 2) % pts.length][1]) / 2).toFixed(1);
    }
    return d + 'Z';
  }

  function sealSvg(label) {
    const id = 'wax' + (++uid);
    const txt = esc(label || 'SiS2');
    const fs = txt.length > 5 ? 13 : 18;
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><defs>' +
      '<radialGradient id="' + id + '" cx="36%" cy="30%" r="75%"><stop offset="0" stop-color="#d4473c"/><stop offset=".5" stop-color="#8b1e1e"/><stop offset="1" stop-color="#4a0b0b"/></radialGradient></defs>' +
      '<path d="' + blobPath(50, 50, 46, 14, 11) + '" fill="url(#' + id + ')" style="filter:drop-shadow(0 4px 5px rgba(0,0,0,.45))"/>' +
      '<circle cx="50" cy="50" r="31" fill="#7a1818" stroke="#4a0b0b" stroke-width="2.5"/>' +
      '<circle cx="50" cy="50" r="27" fill="none" stroke="#e8a088" stroke-opacity=".28" stroke-dasharray="2 3"/>' +
      '<text x="50" y="' + (50 + fs * 0.36) + '" text-anchor="middle" font-family="Cinzel Decorative, Cinzel, serif" font-weight="900" font-size="' + fs + '" fill="#e8a088" fill-opacity=".35" transform="translate(-.8 -.8)">' + txt + '</text>' +
      '<text x="50" y="' + (50 + fs * 0.36) + '" text-anchor="middle" font-family="Cinzel Decorative, Cinzel, serif" font-weight="900" font-size="' + fs + '" fill="#3d0808">' + txt + '</text>' +
      '<ellipse cx="34" cy="28" rx="10" ry="5" fill="#fff" opacity=".18" transform="rotate(-30 34 28)"/></svg>';
  }

  function stackSvg() {
    const sheet = function (rot, tone, cls) {
      return '<g transform="rotate(' + rot + ' 100 125)"' + (cls ? ' class="' + cls + '"' : '') + '><rect x="25" y="18" width="150" height="214" rx="2" fill="' + tone + '" stroke="rgba(90,63,44,.35)"/></g>';
    };
    return '<svg viewBox="0 0 200 272" aria-hidden="true"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf1dc"/><stop offset=".6" stop-color="#f1e1c0"/><stop offset="1" stop-color="#dcc396"/></linearGradient></defs>' +
      sheet(-9, '#d2b98a') + sheet(5, '#dcc59a') + sheet(-3, '#e6d2ab') +
      '<g class="stack-top" style="transition:opacity .3s">' + sheet(2, 'url(#pg)') +
      '<path d="M163 222 L175 210 L175 222 Z" fill="#cdb084" transform="rotate(2 100 125)"/></g>' +
      '<rect x="18" y="108" width="164" height="14" fill="#7a1818" opacity=".85" transform="rotate(-3 100 115)"/>' +
      '<text x="100" y="266" text-anchor="middle" font-family="Cinzel, serif" font-size="11" fill="rgba(243,229,200,.55)" letter-spacing="2">PARCHEMINS</text></svg>';
  }

  function quillShape() {
    // plume en coordonnées locales : bec en (0,0), barbes vers le haut
    let barbs = '';
    for (let y = -48; y > -170; y -= 9) {
      const w = 20 * Math.sin(((-y - 40) / 140) * Math.PI) + 3;
      barbs += '<path d="M0 ' + y + ' q' + (-w * 0.6) + ' -4 ' + (-w) + ' -12" stroke="#c9b896" stroke-width=".9" fill="none"/>' +
               '<path d="M0 ' + y + ' q' + (w * 0.45) + ' -4 ' + (w * 0.7) + ' -12" stroke="#c9b896" stroke-width=".9" fill="none"/>';
    }
    return '<path d="M0 -36 C -20 -64 -24 -128 -6 -182 L0 -178 Z" fill="#f4ede0" stroke="#b9a88a" stroke-width="1"/>' +
      '<path d="M0 -36 C 14 -74 18 -132 3 -184 L0 -178 Z" fill="#e9dfcc" stroke="#b9a88a" stroke-width="1"/>' + barbs +
      '<line x1="0" y1="0" x2="0" y2="-182" stroke="#bda57a" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M-2.4 -6 L0 6 L2.4 -6 Z" fill="#1b1410"/>';
  }

  function inkwellSvg() {
    return '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' +
      '<radialGradient id="glass" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#3b4a5c"/><stop offset=".6" stop-color="#151c26"/><stop offset="1" stop-color="#06090d"/></radialGradient>' +
      '<linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0cf86"/><stop offset=".5" stop-color="#b8883a"/><stop offset="1" stop-color="#6e4c1c"/></linearGradient></defs>' +
      '<ellipse cx="112" cy="116" rx="60" ry="56" fill="rgba(0,0,0,.45)"/>' +
      '<circle cx="100" cy="100" r="58" fill="url(#glass)" stroke="#0b0f14" stroke-width="2"/>' +
      '<path d="M58 78 A48 48 0 0 1 104 46" stroke="#fff" stroke-opacity=".22" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="100" cy="100" r="31" fill="none" stroke="url(#brass)" stroke-width="7"/>' +
      '<circle cx="100" cy="100" r="25" fill="#050508"/><ellipse cx="92" cy="93" rx="7" ry="3.5" fill="#fff" opacity=".2"/>' +
      '<circle class="ink-drop" cx="100" cy="100" r="8" fill="none" stroke="#2a2440" stroke-width="2" style="transform-origin:100px 100px"/>' +
      '<g class="desk__quill"><g transform="translate(100 100) rotate(-38)">' + quillShape() + '</g></g></svg>';
  }

  function candleSvg() {
    return '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' +
      '<radialGradient id="halo"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".55"/><stop offset=".45" stop-color="#ff9a3c" stop-opacity=".16"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="fl" cx="50%" cy="60%"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe9a8"/><stop offset=".7" stop-color="#ff9d2e"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="dish" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9c47a"/><stop offset="1" stop-color="#7a5320"/></linearGradient></defs>' +
      '<circle class="halo" cx="100" cy="100" r="100" fill="url(#halo)"/>' +
      '<circle cx="100" cy="104" r="50" fill="url(#dish)" stroke="#5a3c14" stroke-width="2"/>' +
      '<circle cx="100" cy="104" r="40" fill="none" stroke="#f6dc9c" stroke-opacity=".35"/>' +
      '<path d="' + blobPath(100, 100, 25, 10, 5) + '" fill="#efe2c2" stroke="#cdb98e"/>' +
      '<circle cx="100" cy="100" r="3" fill="#2a1a10"/>' +
      '<ellipse class="flame" cx="100" cy="94" rx="10" ry="15" fill="url(#fl)"/></svg>';
  }

  function dieSvg() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="#7a1818" stroke="#3d0808" stroke-width="2"/>' +
      '<polygon points="50,22 76,66 24,66" fill="#9b2626" stroke="#e5c174" stroke-width="1.4" stroke-opacity=".6"/>' +
      '<path d="M50 4 L50 22 M90 27 L76 66 M10 27 L24 66 M90 73 L76 66 M10 73 L24 66 M50 96 L76 66 M50 96 L24 66 M10 27 L50 22 L90 27" stroke="#e5c174" stroke-opacity=".45" stroke-width="1.2" fill="none"/>' +
      '<text x="50" y="57" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="17" fill="#f0cf86">20</text></svg>';
  }

  function pigeonSvg() {
    return '<svg viewBox="0 0 170 130" aria-hidden="true"><defs>' +
      '<linearGradient id="neck" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5e9a7a"/><stop offset=".5" stop-color="#7d5c9e"/><stop offset="1" stop-color="#8d99a8"/></linearGradient>' +
      '<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9b4c2"/><stop offset="1" stop-color="#7f8a99"/></linearGradient></defs>' +
      '<path d="M30 64 L2 54 L6 74 L32 76 Z" fill="#5f6a78"/><path d="M6 60 L2 54 M8 70 L4 72" stroke="#333b45" stroke-width="2"/>' +
      '<path d="M84 92 L82 108 M82 108 l-6 3 M82 108 l6 3 M96 92 L98 108 M98 108 l-6 3 M98 108 l6 3" stroke="#c4554d" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      '<path d="M28 64 C40 40 96 34 120 50 C132 58 128 82 106 90 C80 98 42 92 28 74 Z" fill="url(#body)" stroke="#4d5664" stroke-width="1.5"/>' +
      '<path d="M104 42 C116 34 126 44 124 60 C118 68 106 66 100 56 Z" fill="url(#neck)"/>' +
      '<g class="head"><circle cx="122" cy="38" r="14" fill="#8d99a8" stroke="#4d5664" stroke-width="1.5"/>' +
      '<circle cx="127" cy="35" r="3.6" fill="#e07a2a"/><circle cx="127.5" cy="35" r="1.7" fill="#111"/>' +
      '<ellipse cx="135" cy="37" rx="3" ry="2.2" fill="#eee"/><path d="M136 39 L150 42 L136 45 Z" fill="#3b3330"/></g>' +
      '<g class="wing"><path d="M80 56 C62 20 32 4 6 8 C24 22 40 40 54 66 Z" fill="#7d8898" stroke="#4d5664" stroke-width="1.5"/>' +
      '<path d="M60 32 C50 26 40 22 28 20 M66 42 C54 36 42 32 30 30" stroke="#3f4855" stroke-width="3" fill="none" stroke-linecap="round"/></g></svg>';
  }

  function featherSvg() {
    return '<svg viewBox="-12 -60 24 64" aria-hidden="true"><path d="M0 -4 C -9 -16 -10 -40 -2 -58 L0 -56 C 6 -40 7 -18 0 -4 Z" fill="#dfe3e8" stroke="#8d99a8" stroke-width="1"/><line x1="0" y1="2" x2="0" y2="-56" stroke="#8d99a8" stroke-width="1.2"/></svg>';
  }

  function stampToolSvg() {
    return '<svg viewBox="0 0 70 110" aria-hidden="true"><defs><linearGradient id="wood" x1="0" x2="1"><stop offset="0" stop-color="#5a3517"/><stop offset=".5" stop-color="#8a5a2b"/><stop offset="1" stop-color="#4a2a10"/></linearGradient>' +
      '<linearGradient id="br2" x1="0" x2="1"><stop offset="0" stop-color="#7a5420"/><stop offset=".5" stop-color="#f0cf86"/><stop offset="1" stop-color="#7a5420"/></linearGradient></defs>' +
      '<ellipse cx="35" cy="14" rx="15" ry="13" fill="url(#wood)"/><path d="M27 22 C29 40 24 52 22 66 L48 66 C46 52 41 40 43 22 Z" fill="url(#wood)"/>' +
      '<rect x="14" y="66" width="42" height="12" rx="3" fill="url(#br2)"/><rect x="18" y="78" width="34" height="26" rx="3" fill="url(#br2)"/></svg>';
  }

  const ornamentSvg = '<svg viewBox="0 0 54 20" aria-hidden="true"><path d="M27 1 L33 10 L27 19 L21 10 Z" fill="currentColor"/><path d="M19 10 C14 3 8 3 4 8 M35 10 C40 17 46 17 50 12" stroke="currentColor" fill="none" stroke-width="1.4"/><circle cx="4" cy="9" r="1.8" fill="currentColor"/><circle cx="50" cy="11" r="1.8" fill="currentColor"/></svg>';
  const tickSvg = '<svg viewBox="0 0 24 24"><path class="box" d="M3 4 Q12 2.6 21 3.6 Q21.8 12 20.7 20.8 Q12 21.5 3.3 20.4 Q2.5 12 3 4 Z"/><path class="tick" d="M6 12.8 L10.4 17.2 L20.5 4.5"/></svg>';
  const dotSvg = '<svg viewBox="0 0 24 24"><path class="box" d="M12 2.8 C18 2.6 21.4 6.4 21.2 12.2 C21 18 17.4 21.4 11.8 21.2 C6.2 21 2.7 17.6 2.9 11.8 C3.1 6.2 6.4 3 12 2.8 Z"/><path class="blot" d="' + blobPath(12, 12, 6.2, 9, 4) + '"/></svg>';
  const filterDefs = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="paper-edge" x="-3%" y="-3%" width="106%" height="106%">' +
    '<feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="10" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';

  function svgNode(markup, cls) {
    const d = el('div', { class: cls || '' });
    d.innerHTML = markup;                     // dessins statiques uniquement
    return d;
  }

  /* ============ Effets sonores (Web Audio, coupés si musique coupée) ============ */
  const sfx = (function () {
    function ok() { return !P.music.muted && P.audioCtx(); }
    function noise(c, dur) {
      const b = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b; return s;
    }
    function burst(freq, q, dur, vol, type, delay) {
      const c = ok(); if (!c) return;
      const t = c.currentTime + (delay || 0);
      const n = noise(c, dur), f = c.createBiquadFilter(), g = c.createGain();
      f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f); f.connect(g); g.connect(c.destination); n.start(t); n.stop(t + dur);
    }
    function tone(f0, f1, dur, vol, type, delay) {
      const c = ok(); if (!c) return;
      const t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    let lastScratch = 0;
    return {
      rustle: function () { burst(2400, 0.7, 0.4, 0.22); burst(1200, 0.8, 0.3, 0.12, 'bandpass', 0.12); },
      dip: function () { tone(900, 260, 0.16, 0.2, 'sine', 0.25); tone(700, 220, 0.12, 0.1, 'sine', 0.42); },
      scratch: function () { const now = performance.now(); if (now - lastScratch < 70) return; lastScratch = now; burst(5200 + Math.random() * 1500, 3, 0.07, 0.05, 'bandpass'); },
      fold: function () { burst(1500, 0.9, 0.28, 0.16); },
      stamp: function () { tone(150, 55, 0.25, 0.5, 'sine'); burst(800, 1, 0.08, 0.2, 'lowpass'); },
      coo: function () { tone(470, 400, 0.28, 0.12, 'triangle'); tone(440, 380, 0.4, 0.12, 'triangle', 0.32); },
      wings: function (n) { for (let i = 0; i < (n || 10); i++) burst(700, 0.8, 0.06, 0.12, 'bandpass', i * 0.07); }
    };
  })();

  /* ============ Construction de la page ============ */
  document.body.classList.add('theme-parchemin');
  document.body.insertAdjacentHTML('afterbegin', filterDefs);
  document.body.appendChild(el('div', { class: 'scene', 'aria-hidden': 'true' }));
  const dust = el('div', { class: 'dust', 'aria-hidden': 'true' });
  for (let i = 0; i < 18; i++) {
    dust.appendChild(el('i', { style: 'left:' + (Math.random() * 100) + '%;top:' + (30 + Math.random() * 70) + '%;animation-duration:' + (9 + Math.random() * 10) + 's;animation-delay:' + (-Math.random() * 15) + 's' }));
  }
  document.body.appendChild(dust);
  const musicUi = P.musicButton({ on: '♫', off: '♫' });

  /* ---------- 1. Accueil : le bureau du scribe ---------- */
  const stackBtn = el('button', { type: 'button', class: 'desk__btn desk__stack is-hint', 'aria-label': T('introStepPaper', 'Prendre un parchemin') });
  stackBtn.innerHTML = stackSvg();
  const inkBtn = el('button', { type: 'button', class: 'desk__btn desk__inkwell', 'aria-label': T('introStepQuill', 'Saisir la plume') });
  inkBtn.innerHTML = inkwellSvg();
  const sheet = el('div', { class: 'desk__sheet', 'aria-hidden': 'true' });
  const help = el('p', { class: 'intro__help', 'aria-live': 'polite', text: T('introHelpPaper', 'Clique sur la pile de parchemins') });
  const stepItems = [
    el('li', { 'data-n': '1', class: 'is-current', text: T('introStepPaper', 'Prends un parchemin') }),
    el('li', { 'data-n': '2', text: T('introStepQuill', 'Saisis la plume') })
  ];
  const prev = P.previous();
  const intro = el('section', { class: 'intro', 'aria-labelledby': 'intro-title' }, [
    el('div', { class: 'intro__kicker', text: T('introKicker', 'Convocation') }),
    el('h1', { class: 'intro__title', id: 'intro-title', text: T('introTitle', EV.title) }),
    el('p', { class: 'intro__line', text: T('introLine', '') }),
    el('div', { class: 'desk' }, [
      svgNode(candleSvg(), 'desk__candle'),
      svgNode(sealSvg(T('seal', 'SiS2')), 'desk__seal'),
      svgNode(dieSvg(), 'desk__die'),
      stackBtn, sheet, inkBtn
    ]),
    el('ol', { class: 'intro__steps' }, stepItems),
    help,
    prev ? el('p', { class: 'intro__note', text: T('already', 'Tu as déjà répondu le {date}.').replace('{date}', new Date(prev.date).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })) }) : null,
    el('button', { type: 'button', class: 'intro__skip', text: P.hasDraft() ? 'Reprendre ma missive en cours' : 'Passer l’introduction', onclick: function () { P.music.start(); musicUi.sync(); openLetter(false); } })
  ]);
  document.body.appendChild(intro);

  let step = 0;
  stackBtn.addEventListener('click', function () {
    if (step !== 0) return;
    step = 1;
    P.music.start(); musicUi.sync();
    sfx.rustle();
    stackBtn.classList.remove('is-hint');
    stackBtn.disabled = true;
    $('.stack-top', stackBtn).style.opacity = '0';
    sheet.classList.add('is-taken');
    stepItems[0].className = 'is-done'; stepItems[1].className = 'is-current';
    help.textContent = T('introHelpQuill', 'Trempe la plume dans l’encre');
    setTimeout(function () { inkBtn.classList.add('is-hint'); inkBtn.focus({ preventScroll: true }); }, 700 * K);
  });
  inkBtn.addEventListener('click', async function () {
    if (step === 0) {
      help.textContent = 'D’abord, prends un parchemin sur la pile.';
      stackBtn.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0)' }], { duration: 400 });
      return;
    }
    if (step !== 1) return;
    step = 2;
    inkBtn.classList.remove('is-hint');
    inkBtn.classList.add('is-dip');
    stepItems[1].className = 'is-done';
    sfx.dip();
    help.textContent = '…';
    await wait(1050);
    sfx.rustle();
    sheet.classList.add('is-grow');
    intro.classList.add('is-leaving');
    await wait(850);
    openLetter(true);
  });

  /* ---------- 2. La lettre ---------- */
  const formEl = el('form', { class: 'sis2-form', novalidate: true, 'aria-label': EV.title });
  const formError = el('p', { class: 'form-error', role: 'alert' });
  const counter = el('p', { class: 'letter__counter' });
  const sealBtn = el('button', { type: 'submit', class: 'seal-btn' });
  sealBtn.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="' + blobPath(50, 50, 44, 12, 9) + '" fill="#e5c174" opacity=".9"/><text x="50" y="60" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="30" fill="#5e1111">✉</text></svg>';
  sealBtn.appendChild(el('span', { text: T('submit', 'Envoyer') }));

  const letterArticle = el('article', { class: 'parchment' }, [
    svgNode(sealSvg(T('seal', 'SiS2')), 'letter__seal'),
    el('header', { class: 'letter__head' }, [
      el('h1', { class: 'letter__title', id: 'letter-title', tabindex: '-1', text: EV.title }),
      el('p', { class: 'letter__salutation', text: T('salutation', '') }),
      el('p', { class: 'letter__subtitle', text: T('subtitle', '') })
    ]),
    svgNode(ornamentSvg, 'ornament'),
    P.closed ? el('p', { class: 'closed-note', text: T('closed', 'Les inscriptions sont closes.') }) : formEl,
    counter
  ]);
  const letter = el('main', { class: 'letter', hidden: true }, [letterArticle, el('footer', { class: 'page-footer', text: T('footer', '') })]);
  document.body.appendChild(letter);

  let sig = null;
  if (!P.closed) {
    P.mount(formEl);
    formEl.appendChild(formError);
    formEl.appendChild(sealBtn);
    // cases et ronds dessinés à l'encre
    $$('.opt', formEl).forEach(function (o) {
      const isRadio = $('input', o).type === 'radio';
      $('.opt__mark', o).innerHTML = isRadio ? dotSvg : tickSvg;
    });
    sig = setupSignature();
  }

  function setupSignature() {
    const input = $('.q__input--signature', formEl);
    if (!input) return null;
    const control = input.parentNode;
    const ink = el('div', { class: 'sig__ink', 'aria-hidden': 'true' });
    const quill = el('div', { class: 'sig__quill', 'aria-hidden': 'true' });
    quill.innerHTML = '<svg viewBox="0 0 74 74" style="overflow:visible"><g transform="translate(6 70) rotate(32)">' + quillShape().replace(/stroke-width="\.9"/g, 'stroke-width=".6"') + '</g></svg>';
    quill.firstChild.firstChild.setAttribute('transform', 'translate(6 70) rotate(32) scale(.4)');
    const wrap = el('div', { class: 'sig' }, [el('span', { class: 'sig__x', 'aria-hidden': 'true', text: '✗' }), ink, quill, el('div', { class: 'sig__line', 'aria-hidden': 'true' })]);
    control.insertBefore(wrap, input);
    wrap.insertBefore(input, ink);
    let shown = '';
    let idle;
    const baseSize = parseFloat(getComputedStyle(input).fontSize);

    function fit() {
      let size = baseSize;
      input.style.fontSize = ink.style.fontSize = '';
      while (ink.scrollWidth > ink.clientWidth + 1 && size > 22) {
        size -= 2;
        input.style.fontSize = ink.style.fontSize = size + 'px';
      }
    }
    function render(animate) {
      const v = input.value;
      let i = 0;
      while (i < shown.length && i < v.length && shown[i] === v[i]) i++;
      while (ink.childNodes.length > i) ink.removeChild(ink.lastChild);
      for (let j = i; j < v.length; j++) {
        const s = el('span', { text: v[j] });
        if (!animate) s.style.animation = 'none';
        ink.appendChild(s);
      }
      shown = v;
      fit();
      // la plume suit la fin du texte
      const last = ink.lastChild;
      const x = last ? last.offsetLeft + last.offsetWidth : ink.clientWidth / 2;
      quill.style.left = (x - 6) + 'px';
      quill.style.top = (ink.offsetTop + ink.offsetHeight - 74 - 4) + 'px';
    }
    input.addEventListener('input', function () {
      render(true);
      sfx.scratch();
      wrap.classList.add('is-writing');
      clearTimeout(idle);
      idle = setTimeout(function () { wrap.classList.remove('is-writing'); }, 900);
    });
    window.addEventListener('resize', function () { render(false); });
    return { render: render, reset: function () { shown = ''; ink.replaceChildren(); input.style.fontSize = ink.style.fontSize = ''; } };
  }

  function openLetter(animate) {
    intro.hidden = true;
    letter.hidden = false;
    window.scrollTo(0, 0);
    if (animate && !P.reducedMotion) {
      letter.classList.add('is-unrolling');
      setTimeout(function () { letter.classList.remove('is-unrolling'); }, 3300);
    }
    if (sig) setTimeout(function () { sig.render(false); }, 60);
    $('#letter-title').focus({ preventScroll: true });
    P.count().then(function (n) { if (n > 0) counter.textContent = n + ' ' + T('counter', 'réponse(s) déjà reçue(s)'); });
  }

  /* ---------- 3. Envoi : pli, sceau, pigeon ---------- */
  const status = el('p', { class: 'anim__status', 'aria-live': 'polite' });
  const fold = el('div', { class: 'fold', 'aria-hidden': 'true' }, [
    el('div', { class: 'fold__p fold__p--1' }), el('div', { class: 'fold__p fold__p--2' }),
    el('div', { class: 'fold__p fold__p--3' }, [el('span', { class: 'fold__sig' })])
  ]);
  const envSeal = svgNode(sealSvg(T('seal', 'SiS2')), 'env__seal');
  const stampTool = svgNode(stampToolSvg(), 'stamp-tool');
  const env = el('div', { class: 'env', 'aria-hidden': 'true' }, [
    el('div', { class: 'env__flap' }), el('div', { class: 'env__back' }), el('div', { class: 'env__front' }), envSeal, stampTool
  ]);
  const pigeon = svgNode(pigeonSvg(), 'pigeon');
  const carrier = el('div', { class: 'carrier' }, [fold, env, pigeon]);
  const overlay = el('div', { class: 'anim', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Envoi de la missive' }, [
    el('div', { class: 'anim__stage' }, [carrier]), status
  ]);
  document.body.appendChild(overlay);

  function feathers(n, x, y) {
    for (let i = 0; i < n; i++) {
      const f = svgNode(featherSvg(), 'feather');
      f.style.left = (x + Math.random() * 60 - 30) + 'px';
      f.style.top = (y + Math.random() * 20) + 'px';
      f.style.setProperty('--dx', (Math.random() * 140 - 70) + 'px');
      f.style.setProperty('--rot', (Math.random() * 500 - 250) + 'deg');
      f.style.animationDelay = (i * 0.25) + 's';
      overlay.firstChild.appendChild(f);
      setTimeout(function () { f.remove(); }, 4000);
    }
  }

  function resetAnim() {
    fold.className = 'fold'; env.className = 'env'; envSeal.className = 'env__seal'; stampTool.className = 'stamp-tool';
    pigeon.className = 'pigeon'; carrier.className = 'carrier';
  }

  async function playSend(answers, sending) {
    resetAnim();
    $('.fold__sig', fold).textContent = P.nameFrom(answers);
    letter.classList.add('is-sending');
    overlay.hidden = false;
    await wait(30);
    overlay.classList.add('is-on');
    status.textContent = T('animFold', 'Pliage…');
    await wait(650);
    letter.hidden = true; letter.classList.remove('is-sending');
    sfx.fold(); fold.classList.add('is-folded');
    await wait(1250);
    status.textContent = T('animEnvelope', 'Mise sous enveloppe…');
    env.classList.add('is-on');
    await wait(450);
    fold.classList.add('is-in'); sfx.rustle();
    await wait(950);
    env.classList.add('is-closed'); sfx.fold();
    await wait(650);
    status.textContent = T('animSeal', 'Le sceau est apposé…');
    stampTool.classList.add('is-on');
    await wait(450);
    envSeal.classList.add('is-on'); sfx.stamp();
    await wait(800);
    status.textContent = T('animPigeon', 'Le pigeon arrive…');
    pigeon.classList.add('is-in'); sfx.wings(14);
    await wait(1150);
    pigeon.classList.add('is-perched'); sfx.coo();
    feathers(2, 150, 60);
    // on attend la réponse du serveur, le pigeon patiente
    let res;
    const slow = setTimeout(function () { status.textContent = T('animWait', 'Le pigeon cherche son chemin…'); }, 900);
    res = await sending;
    clearTimeout(slow);
    if (!res.ok) {
      status.textContent = 'Le pigeon refuse de partir : la route vers le donjon est coupée. Ta lettre est conservée, réessaie dans un instant.';
      pigeon.classList.remove('is-perched');
      await wait(3200);
      overlay.classList.remove('is-on');
      await wait(500);
      overlay.hidden = true;
      letter.hidden = false;
      formError.textContent = 'Envoi impossible (' + (res.err && res.err.message || 'réseau') + '). Rien n’est perdu : clique à nouveau sur le bouton.';
      formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return res;
    }
    await wait(500);
    status.textContent = T('animFly', 'Envol !');
    pigeon.classList.remove('is-perched'); sfx.wings(20);
    carrier.classList.add('is-flying');
    feathers(3, 160, 80);
    await wait(1900);
    overlay.classList.remove('is-on');
    await wait(500);
    overlay.hidden = true;
    return res;
  }

  formEl.addEventListener('input', function () { if (formError.textContent && !$('.q--invalid', formEl)) formError.textContent = ''; });

  let busy = false;
  formEl.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (busy) return;
    const v = P.validate();
    const n = Object.keys(v.errors).length;
    if (!v.ok) { formError.textContent = 'Le parchemin est incomplet : ' + n + ' point' + (n > 1 ? 's' : '') + ' à compléter.'; return; }
    formError.textContent = '';
    busy = true; sealBtn.disabled = true;
    const answers = P.collect();
    const sending = P.submit(answers).then(function (r) { return { ok: true, r: r }; }, function (err) { return { ok: false, err: err }; });
    const res = await playSend(answers, sending);
    busy = false; sealBtn.disabled = false;
    if (res.ok) showSuccess(answers, res.r);
  });

  /* ---------- 4. Copie conforme ---------- */
  const success = el('main', { class: 'success', hidden: true });
  document.body.appendChild(success);

  function showSuccess(answers, r) {
    const nameId = (EV.questions.find(function (q) { return q.role === 'name'; }) || {}).id;
    const items = P.summary(answers).filter(function (s) { return s.id !== nameId; });
    const nth = r && r.count ? (r.count === 1 ? '1ʳᵉ' : r.count + 'ᵉ') : null;
    success.replaceChildren(
      el('article', { class: 'parchment' }, [
        svgNode(sealSvg(T('seal', 'SiS2')), 'letter__seal'),
        el('h1', { class: 'success__title', tabindex: '-1', text: T('successTitle', 'Merci !') }),
        el('p', { class: 'success__line', text: T('successLine', '') }),
        nth ? el('p', { class: 'letter__counter', text: 'Ta missive est la ' + nth + ' reçue par la Guilde.' }) : null,
        r && r.preview ? el('p', { class: 'letter__counter', text: '(Mode aperçu : rien n’a été envoyé.)' }) : null,
        el('div', { class: 'receipt' }, [
          el('p', { class: 'receipt__title', text: T('receiptTitle', 'Récapitulatif') }),
          el('dl', null, items.reduce(function (acc, s) {
            acc.push(el('dt', null, [s.icon ? s.icon + ' ' : '', s.label]));
            acc.push(el('dd', { text: s.value }));
            return acc;
          }, [])),
          el('p', { class: 'receipt__sig', text: P.nameFrom(answers) }),
          el('p', { class: 'receipt__date', text: 'Scellé le ' + new Date().toLocaleString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })
        ]),
        el('button', { type: 'button', class: 'btn-ghost', text: '✒ ' + T('again', 'Nouvelle réponse'), onclick: function () {
          P.reset(); if (sig) sig.reset();
          success.hidden = true; openLetter(true);
        } })
      ]),
      el('footer', { class: 'page-footer', text: T('footer', '') })
    );
    success.hidden = false;
    window.scrollTo(0, 0);
    $('.success__title', success).focus({ preventScroll: true });
  }
})();
