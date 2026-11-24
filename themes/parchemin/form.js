/* ============================================================
 *  Thème « Parchemin » — orchestration du formulaire
 *  Le bureau (desk.js) gère la scène ; ici : la lettre en HTML
 *  (accessible, au clavier), la signature à la plume, l'envoi
 *  et la copie conforme.
 * ============================================================ */
(function () {
  'use strict';
  const P = window.Platform, Desk = window.Desk;
  if (!P || !Desk) return;
  const EV = P.event, el = P.el, $ = P.$, $$ = P.$$, T = P.text;
  const sfx = Desk.sfx;

  document.body.classList.add('theme-parchemin');

  /* ---------- petits dessins vectoriels (encre) ---------- */
  const tickSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="box" d="M3.4 4.2 Q12 2.9 20.8 3.8 Q21.6 12 20.5 20.6 Q12 21.4 3.6 20.3 Q2.7 12 3.4 4.2 Z"/><path class="tick" d="M6 12.6 Q8.5 14.5 10.3 17.4 Q14 9 21.5 3.6"/></svg>';
  const dotSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="box" d="M12 3 C17.8 2.8 21.3 6.5 21.1 12.2 C20.9 17.8 17.3 21.3 11.8 21.1 C6.3 20.9 2.8 17.4 3 11.8 C3.2 6.3 6.5 3.2 12 3 Z"/><path class="blot" d="M12 6.8 C15.4 6.5 17.4 8.9 17.2 12.3 C17 15.4 14.8 17.4 11.7 17.2 C8.7 17 6.8 14.9 7 11.8 C7.2 8.9 9.1 7 12 6.8 Z"/></svg>';
  const flourish = '<svg viewBox="0 0 240 24" aria-hidden="true"><path d="M4 13 C40 13 60 6 96 11 C108 13 112 18 120 12 C128 6 132 11 144 13 C180 18 200 11 236 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M114 12 C116 5 124 5 126 12 C124 19 116 19 114 12 Z" fill="currentColor"/></svg>';
  const soundSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path class="w1" d="M15.5 9.2c1 .8 1.5 1.7 1.5 2.8s-.5 2-1.5 2.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path class="w2" d="M17.8 6.8c1.8 1.4 2.7 3.1 2.7 5.2s-.9 3.8-2.7 5.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path class="x" d="M16 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  /* ---------- interface flottante ---------- */
  const soundUi = P.musicButton({ on: '', off: '' });
  const soundBtn = soundUi.button;
  soundBtn.classList.add('sound-toggle');
  const paintSound = function () { soundBtn.innerHTML = soundSvg; soundBtn.setAttribute('aria-label', P.music.playing ? 'Couper le son' : 'Activer le son'); soundBtn.title = soundBtn.getAttribute('aria-label'); };
  paintSound();
  soundBtn.addEventListener('click', paintSound);
  const syncSound = function () { soundUi.sync(); paintSound(); };

  const skip = el('button', { type: 'button', class: 'skip-intro', text: P.hasDraft() ? 'Reprendre ma missive' : 'Passer l’introduction' });
  document.body.appendChild(skip);

  const prev = P.previous();
  if (prev) {
    const note = el('p', { class: 'toast-note', role: 'status', text: T('already', 'Tu as déjà répondu le {date}.').replace('{date}', new Date(prev.date).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })) });
    document.body.appendChild(note);
    setTimeout(function () { note.classList.add('is-on'); }, 1500);
    setTimeout(function () { note.classList.remove('is-on'); }, 10000);
  }

  /* ---------- la lettre ---------- */
  const formEl = el('form', { class: 'sis2-form', novalidate: true, 'aria-label': EV.title });
  const formError = el('p', { class: 'form-error', role: 'alert' });
  const counter = el('p', { class: 'letter__counter' });
  const sealBtn = el('button', { type: 'submit', class: 'seal-btn' }, [
    el('span', { class: 'seal-btn__wax', 'aria-hidden': 'true' }),
    el('span', { class: 'seal-btn__label', text: T('submit', 'Envoyer') })
  ]);
  const fl = el('div', { class: 'flourish', 'aria-hidden': 'true' }); fl.innerHTML = flourish;
  const parchment = el('article', { class: 'parchment' }, [
    el('header', { class: 'letter__head' }, [
      el('p', { class: 'letter__kicker', text: T('introKicker', '') }),
      el('h1', { class: 'letter__title', id: 'letter-title', tabindex: '-1', text: EV.title }),
      el('p', { class: 'letter__salutation', text: T('salutation', '') }),
      el('p', { class: 'letter__subtitle', text: T('subtitle', '') })
    ]),
    fl,
    P.closed ? el('p', { class: 'closed-note', text: T('closed', 'Les inscriptions sont closes.') }) : formEl,
    counter
  ]);
  const letter = el('main', { class: 'letter', hidden: true }, [parchment, el('footer', { class: 'page-footer', text: T('footer', '') })]);
  document.body.appendChild(letter);

  let sig = null;
  if (!P.closed) {
    P.mount(formEl);
    formEl.appendChild(formError);
    formEl.appendChild(sealBtn);
    $$('.opt', formEl).forEach(function (o) { $('.opt__mark', o).innerHTML = $('input', o).type === 'radio' ? dotSvg : tickSvg; });
    sig = setupSignature();
    formEl.addEventListener('change', function (e) { if (e.target.matches('input[type=checkbox],input[type=radio]')) sfx.tick(); });
    formEl.addEventListener('input', function (e) {
      if (e.target.matches('textarea, input[type=text], input[type=email], input[type=number]') && !e.target.classList.contains('q__input--signature')) sfx.scratch();
      if (formError.textContent && !$('.q--invalid', formEl)) formError.textContent = '';
    });
  }

  function setupSignature() {
    const input = $('.q__input--signature', formEl);
    if (!input) return null;
    const control = input.parentNode;
    const ink = el('div', { class: 'sig__ink', 'aria-hidden': 'true' });
    const quill = el('img', { class: 'sig__quill', alt: '', 'aria-hidden': 'true' });
    const wrap = el('div', { class: 'sig' }, [el('span', { class: 'sig__x', 'aria-hidden': 'true', text: '×' }), ink, quill, el('div', { class: 'sig__line', 'aria-hidden': 'true' })]);
    control.insertBefore(wrap, input);
    wrap.insertBefore(input, ink);
    let shown = '', idle;
    function fit() {
      input.style.fontSize = ink.style.fontSize = '';
      let size = parseFloat(getComputedStyle(input).fontSize);
      while (ink.scrollWidth > ink.clientWidth + 1 && size > 20) { size -= 2; input.style.fontSize = ink.style.fontSize = size + 'px'; }
    }
    function render(animate) {
      const v = input.value;
      let i = 0;
      while (i < shown.length && i < v.length && shown[i] === v[i]) i++;
      while (ink.childNodes.length > i) ink.removeChild(ink.lastChild);
      for (let j = i; j < v.length; j++) { const s = el('span', { text: v[j] }); if (!animate) s.style.animation = 'none'; ink.appendChild(s); }
      shown = v; fit();
      const lastC = ink.lastChild;
      const xEnd = lastC ? lastC.offsetLeft + lastC.offsetWidth : ink.clientWidth / 2;
      quill.style.transform = 'translate(' + (xEnd - 4) + 'px,' + (ink.offsetTop + ink.offsetHeight - 60) + 'px)';
    }
    input.addEventListener('input', function () {
      render(true); sfx.scratch();
      wrap.classList.add('is-writing'); clearTimeout(idle);
      idle = setTimeout(function () { wrap.classList.remove('is-writing'); }, 900);
    });
    window.addEventListener('resize', function () { render(false); });
    return { render: render, quill: quill, reset: function () { shown = ''; ink.replaceChildren(); input.style.fontSize = ink.style.fontSize = ''; } };
  }

  let decorated = false;
  function decorate() {
    if (decorated) return;
    decorated = true;
    // papier, cachet et curseur-plume générés par le bureau
    const w = Math.min(760, window.innerWidth - 16);
    const h = Math.max(900, parchment.offsetHeight || 1800);
    parchment.style.setProperty('--paper', 'url(' + Desk.paperDataURL(Math.round(w * 0.55), Math.round(h * 0.55), 21) + ')');
    document.documentElement.style.setProperty('--seal', 'url(' + Desk.sealDataURL(240) + ')');
    const qc = Desk.quillCursor();
    document.documentElement.style.setProperty('--quill-cursor', 'url(' + qc + ') 6 58, auto');
    if (sig) sig.quill.src = qc;
  }

  /* ---------- ouverture de la lettre depuis la feuille du bureau ---------- */
  function openLetter(fromRect) {
    skip.hidden = true;
    letter.hidden = false;
    Desk.setMode('letter');
    window.scrollTo(0, 0);
    decorate();
    if (sig) setTimeout(function () { sig.render(false); }, 60);
    if (fromRect && !P.reducedMotion) {
      const r = parchment.getBoundingClientRect();
      const sc = fromRect.w / r.width;
      const dx = (fromRect.x + fromRect.w / 2) - (r.left + r.width / 2);
      const dy = fromRect.y - r.top;
      parchment.style.transition = 'none';
      parchment.style.transformOrigin = '50% 0';
      parchment.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + fromRect.a + 'rad) scale(' + sc + ')';
      parchment.style.opacity = '0.4';
      void parchment.offsetWidth;
      parchment.style.transition = 'transform 1.1s cubic-bezier(.6,.05,.25,1), opacity .4s ease';
      parchment.style.transform = 'none';
      parchment.style.opacity = '1';
      letter.classList.add('is-opening');
      sfx.paperGrab();
      setTimeout(function () { letter.classList.remove('is-opening'); parchment.style.transition = ''; parchment.style.transform = ''; parchment.style.opacity = ''; }, 2400);
    }
    $('#letter-title').focus({ preventScroll: true });
    P.count().then(function (n) { if (n > 0) counter.textContent = n + ' ' + T('counter', 'réponse(s) déjà reçue(s)'); });
  }

  skip.addEventListener('click', function () {
    if (!P.music.playing && !P.music.muted) { P.music.start(); syncSound(); }
    Desk.skip();
    openLetter(null);
  });

  /* ---------- envoi ---------- */
  let busy = false;
  formEl.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (busy) return;
    const v = P.validate();
    const n = Object.keys(v.errors).length;
    if (!v.ok) { formError.textContent = 'La missive est incomplète : ' + n + ' point' + (n > 1 ? 's' : '') + ' à compléter.'; sfx.crease(3); return; }
    formError.textContent = '';
    busy = true; sealBtn.disabled = true;
    const answers = P.collect();
    const sending = P.submit(answers).then(function (r) { return { ok: true, r: r }; }, function (err) { return { ok: false, err: err }; });
    // la lettre redescend sur le sous-main
    const b = Desk.layout.blot;
    window.scrollTo({ top: 0, behavior: P.reducedMotion ? 'auto' : 'smooth' });
    await P.sleep(P.reducedMotion ? 0 : 450);
    const r = parchment.getBoundingClientRect();
    const sc = (Desk.layout.sheetW * 1.12) / r.width;
    parchment.style.transformOrigin = '50% 0';
    parchment.style.transition = 'transform .8s cubic-bezier(.5,0,.3,1), opacity .45s .4s ease';
    parchment.style.transform = 'translate(' + (b.x - (r.left + r.width / 2)) + 'px,' + (b.y - Desk.layout.sheetH * 0.6 - r.top) + 'px) scale(' + sc + ')';
    parchment.style.opacity = '0';
    sfx.paperGrab();
    await P.sleep(P.reducedMotion ? 100 : 950);
    letter.hidden = true;
    parchment.style.transition = 'none'; parchment.style.transform = ''; parchment.style.opacity = '';
    const res = await Desk.playSend(answers, sending, P.nameFrom(answers));
    busy = false; sealBtn.disabled = false;
    if (res.ok) showSuccess(answers, res.r);
    else {
      letter.hidden = false;
      Desk.setMode('letter');
      formError.textContent = 'Le pigeon n’a pas pu partir (' + ((res.err && res.err.message) || 'réseau') + '). Rien n’est perdu : scelle à nouveau la missive.';
      formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  /* ---------- copie conforme ---------- */
  const success = el('main', { class: 'success', hidden: true });
  document.body.appendChild(success);

  function showSuccess(answers, r) {
    const nameId = (EV.questions.find(function (q) { return q.role === 'name'; }) || {}).id;
    const items = P.summary(answers).filter(function (s) { return s.id !== nameId; });
    const nth = r && r.count ? (r.count === 1 ? '1ʳᵉ' : r.count + 'ᵉ') : null;
    const card = el('article', { class: 'parchment parchment--receipt' }, [
      el('p', { class: 'letter__kicker', text: T('receiptTitle', 'Récapitulatif') }),
      el('h1', { class: 'success__title', tabindex: '-1', text: T('successTitle', 'Merci !') }),
      el('p', { class: 'success__line', text: T('successLine', '') }),
      el('dl', { class: 'receipt' }, items.reduce(function (acc, s) {
        acc.push(el('dt', { text: s.label }));
        acc.push(el('dd', { text: s.value }));
        return acc;
      }, [])),
      el('div', { class: 'receipt__foot' }, [
        el('span', { class: 'receipt__seal', 'aria-hidden': 'true' }),
        el('div', null, [
          el('p', { class: 'receipt__sig', text: P.nameFrom(answers) }),
          el('p', { class: 'receipt__date', text: 'Scellé le ' + new Date().toLocaleString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })
        ])
      ]),
      nth ? el('p', { class: 'letter__counter', text: 'Ta missive est la ' + nth + ' reçue par la Guilde.' }) : null,
      r && r.preview ? el('p', { class: 'letter__counter', text: '(Mode aperçu : rien n’a été envoyé.)' }) : null,
      el('button', { type: 'button', class: 'btn-ink', text: T('again', 'Nouvelle réponse'), onclick: function () {
        P.reset(); if (sig) sig.reset();
        success.hidden = true; openLetter(null);
      } })
    ]);
    card.style.setProperty('--paper', 'url(' + Desk.paperDataURL(400, 600, 33) + ')');
    success.replaceChildren(card);
    success.hidden = false;
    sfx.paperDrop();
    window.scrollTo(0, 0);
    $('.success__title', success).focus({ preventScroll: true });
  }

  /* ---------- démarrage ---------- */
  Desk.init({
    onLetter: function (rect) { openLetter(rect); },
    onSound: syncSound
  }).then(function () {
    Desk.setMode('intro');
    if (P.closed) { Desk.skip(); openLetter(null); }
  });
})();
