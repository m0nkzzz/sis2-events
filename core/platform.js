/* ============================================================
 *  SiS2 Events — moteur de formulaire commun
 *  Lit window.EVENT (config.js de l'événement), construit les
 *  questions, gère conditions, brouillon, validation, envoi,
 *  musique. Les thèmes s'occupent de la mise en scène.
 * ============================================================ */
(function () {
  'use strict';

  const EV = window.EVENT;
  if (!EV) { console.error('window.EVENT manquant : config.js non chargé ?'); return; }

  const params = new URLSearchParams(location.search);
  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
  };
  const KEY_DRAFT = 'sis2:' + EV.slug + ':draft';
  const KEY_SENT = 'sis2:' + EV.slug + ':sent';
  const KEY_MUTE = 'sis2:music-muted';
  const OTHER = '__other__';

  /* ---------- petits utilitaires ---------- */

  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function roman(n) {
    const t = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    t.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } });
    return s;
  }

  function normOptions(q) {
    return (q.options || []).map(function (o) {
      return typeof o === 'string' ? { value: o, label: o } : Object.assign({ label: o.value }, o);
    });
  }
  function otherCfg(q) {
    if (!q.other) return null;
    return Object.assign({ label: 'Autre', placeholder: 'Précise…' }, q.other === true ? {} : q.other);
  }

  /* ---------- rendu des questions ---------- */

  function renderQuestion(q, index) {
    const id = 'q-' + q.id;
    const numbering = EV.numbering === 'roman' ? roman(index + 1) + '.' : EV.numbering === 'number' ? (index + 1) + '.' : null;
    const isGroup = q.type === 'multi' || q.type === 'choice';
    const labelChildren = [
      q.icon ? el('span', { class: 'q__icon', 'aria-hidden': 'true', text: q.icon }) : null,
      numbering ? el('span', { class: 'q__num', text: numbering }) : null,
      el('span', { class: 'q__text', text: q.label }),
      q.required ? el('span', { class: 'q__req', 'aria-hidden': 'true', text: '*' }) : null
    ];
    const label = isGroup
      ? el('h2', { class: 'q__label', id: id + '-label' }, labelChildren)
      : el('label', { class: 'q__label', for: id }, labelChildren);

    const wrap = el('section', {
      class: 'q q--' + q.type + (q.className ? ' ' + q.className : ''),
      dataset: { q: q.id }
    }, [
      label,
      q.hint ? el('p', { class: 'q__hint', text: q.hint }) : null
    ]);

    let control;
    if (isGroup) {
      const type = q.type === 'multi' ? 'checkbox' : 'radio';
      control = el('div', {
        class: 'q__options' + (q.layout ? ' q__options--' + q.layout : ''),
        role: q.type === 'choice' ? 'radiogroup' : 'group',
        'aria-labelledby': id + '-label'
      });
      normOptions(q).forEach(function (o) {
        control.appendChild(el('label', { class: 'opt' }, [
          el('input', { type: type, name: q.id, value: o.value }),
          el('span', { class: 'opt__mark', 'aria-hidden': 'true' }),
          o.icon ? el('span', { class: 'opt__icon', 'aria-hidden': 'true', text: o.icon }) : null,
          el('span', { class: 'opt__text' }, [
            el('span', { class: 'opt__label', text: o.label }),
            o.hint ? el('small', { class: 'opt__hint', text: o.hint }) : null
          ])
        ]));
      });
      const oc = otherCfg(q);
      if (oc) {
        const box = el('input', { type: type, name: q.id, value: OTHER });
        const txt = el('input', {
          type: 'text', class: 'opt__other-input', placeholder: oc.placeholder, maxlength: '200',
          'aria-label': oc.label + ' — ' + q.label
        });
        txt.addEventListener('input', function () { if (txt.value.trim()) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); } });
        box.addEventListener('change', function () { if (box.checked) setTimeout(function () { txt.focus(); }, 0); });
        control.appendChild(el('label', { class: 'opt opt--other' }, [
          box,
          el('span', { class: 'opt__mark', 'aria-hidden': 'true' }),
          oc.icon ? el('span', { class: 'opt__icon', 'aria-hidden': 'true', text: oc.icon }) : null,
          el('span', { class: 'opt__text' }, [el('span', { class: 'opt__label', text: oc.label + ' :' })]),
          txt
        ]));
      }
    } else if (q.type === 'select') {
      control = el('select', { class: 'q__input', id: id, name: q.id }, [el('option', { value: '', text: q.placeholder || '— Choisir —' })]
        .concat(normOptions(q).map(function (o) { return el('option', { value: o.value, text: o.label }); })));
    } else if (q.type === 'textarea') {
      control = el('textarea', { class: 'q__input', id: id, name: q.id, placeholder: q.placeholder || '', maxlength: String(q.maxLength || 1500), rows: '4' });
    } else {
      const inputType = q.type === 'number' ? 'number' : q.type === 'email' ? 'email' : 'text';
      control = el('input', {
        class: 'q__input' + (q.type === 'signature' ? ' q__input--signature' : ''),
        id: id, name: q.id, type: inputType, placeholder: q.placeholder || '',
        maxlength: inputType === 'text' ? String(q.maxLength || 120) : null,
        min: q.min != null ? String(q.min) : null, max: q.max != null ? String(q.max) : null,
        autocomplete: q.role === 'name' ? 'name' : (q.type === 'email' ? 'email' : 'off'),
        inputmode: q.type === 'number' ? 'numeric' : null
      });
    }
    wrap.appendChild(el('div', { class: 'q__control' }, [control]));
    wrap.appendChild(el('p', { class: 'q__error', role: 'alert' }));
    return wrap;
  }

  /* ---------- état du formulaire ---------- */

  let formEl = null;

  function readQuestion(q) {
    if (q.type === 'multi') {
      return $$('input[name="' + q.id + '"]:checked', formEl).map(function (i) { return i.value; });
    }
    if (q.type === 'choice') {
      const c = $('input[name="' + q.id + '"]:checked', formEl);
      return c ? c.value : '';
    }
    const n = $('[name="' + q.id + '"]', formEl);
    if (!n) return '';
    if (q.type === 'number') return n.value === '' ? '' : Number(n.value);
    return n.value.trim();
  }
  function otherText(q) {
    const t = $('[data-q="' + q.id + '"] .opt__other-input', formEl);
    return t ? t.value.trim() : '';
  }

  function isVisible(q, values) {
    const c = q.showIf;
    if (!c) return true;
    const v = values[c.id];
    const arr = Array.isArray(v) ? v : [v];
    if (c.equals !== undefined) return arr.indexOf(c.equals) !== -1;
    if (c.in) return arr.some(function (x) { return c.in.indexOf(x) !== -1; });
    if (c.notIn) return !arr.some(function (x) { return c.notIn.indexOf(x) !== -1; });
    if (c.filled) return arr.some(function (x) { return x !== '' && x != null; });
    return true;
  }

  function rawValues() {
    const v = {};
    EV.questions.forEach(function (q) { v[q.id] = readQuestion(q); });
    return v;
  }

  function applyConditions() {
    const values = rawValues();
    EV.questions.forEach(function (q) {
      const node = $('[data-q="' + q.id + '"]', formEl);
      if (!node) return;
      const show = isVisible(q, values);
      if (node.hidden === show) {
        node.hidden = !show;
        node.classList.toggle('q--revealed', show);
      }
    });
  }

  /** Réponses prêtes à l'envoi (questions masquées exclues). */
  function collect() {
    const values = rawValues();
    const answers = {};
    EV.questions.forEach(function (q) {
      if (!isVisible(q, values)) return;
      let v = values[q.id];
      const oc = otherCfg(q);
      if (oc && (Array.isArray(v) ? v.indexOf(OTHER) !== -1 : v === OTHER)) {
        v = Array.isArray(v) ? v.map(function (x) { return x === OTHER ? oc.label : x; }) : oc.label;
        answers[q.id + '_autre'] = otherText(q);
      }
      if (v === '' || (Array.isArray(v) && !v.length)) return;
      answers[q.id] = v;
    });
    return answers;
  }

  function validate() {
    const values = rawValues();
    const errors = {};
    EV.questions.forEach(function (q) {
      if (!isVisible(q, values)) return;
      const v = values[q.id];
      const empty = v === '' || v == null || (Array.isArray(v) && !v.length);
      const msg = q.errorMessage;
      if (q.required && empty) { errors[q.id] = msg || (q.type === 'multi' ? 'Choisis au moins une option.' : q.type === 'choice' ? 'Fais ton choix.' : 'Ce champ est requis.'); return; }
      if (empty) return;
      if (q.type === 'multi' && q.minSelect && v.length < q.minSelect) errors[q.id] = 'Choisis au moins ' + q.minSelect + ' options.';
      if (q.type === 'multi' && q.maxSelect && v.length > q.maxSelect) errors[q.id] = 'Maximum ' + q.maxSelect + ' choix.';
      if (otherCfg(q) && (Array.isArray(v) ? v.indexOf(OTHER) !== -1 : v === OTHER) && !otherText(q)) errors[q.id] = 'Précise ton « ' + otherCfg(q).label + ' ».';
      if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[q.id] = 'Adresse mail invalide.';
      if (q.type === 'number' && ((q.min != null && v < q.min) || (q.max != null && v > q.max))) errors[q.id] = 'Valeur entre ' + q.min + ' et ' + q.max + '.';
    });
    $$('.q', formEl).forEach(function (n) {
      const e = errors[n.dataset.q];
      n.classList.toggle('q--invalid', !!e);
      $('.q__error', n).textContent = e || '';
    });
    const first = Object.keys(errors)[0];
    if (first) {
      const node = $('[data-q="' + first + '"]', formEl);
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return { ok: !first, errors: errors };
  }

  /* ---------- brouillon local ---------- */

  function saveDraft() {
    const d = {};
    EV.questions.forEach(function (q) {
      d[q.id] = readQuestion(q);
      if (otherCfg(q)) d[q.id + '_autre'] = otherText(q);
    });
    LS.set(KEY_DRAFT, d);
  }
  function restoreDraft() {
    const d = LS.get(KEY_DRAFT);
    if (!d) return false;
    EV.questions.forEach(function (q) {
      const v = d[q.id];
      if (v == null) return;
      if (q.type === 'multi' || q.type === 'choice') {
        const arr = Array.isArray(v) ? v : [v];
        $$('input[name="' + q.id + '"]', formEl).forEach(function (i) { i.checked = arr.indexOf(i.value) !== -1; });
        const t = $('[data-q="' + q.id + '"] .opt__other-input', formEl);
        if (t && d[q.id + '_autre']) t.value = d[q.id + '_autre'];
      } else {
        const n = $('[name="' + q.id + '"]', formEl);
        if (n) n.value = v;
      }
    });
    return true;
  }

  /* ---------- envoi ---------- */

  function nameFrom(answers) {
    const q = EV.questions.find(function (x) { return x.role === 'name'; });
    return q ? String(answers[q.id] || '') : '';
  }

  async function submit(answers) {
    const labels = {};
    EV.questions.forEach(function (q) {
      labels[q.id] = q.label;
      if (otherCfg(q)) labels[q.id + '_autre'] = q.label + ' (' + otherCfg(q).label + ')';
    });
    const hp = $('input[name="_website"]', formEl);
    const payload = {
      event: EV.slug,
      name: nameFrom(answers),
      answers: answers,
      hp: hp ? hp.value : '',
      meta: { title: EV.title, accent: EV.accent, labels: labels }
    };
    let result;
    if (P.preview) {
      await sleep(700);
      result = { ok: true, id: 'apercu', preview: true };
    } else {
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(EV.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          result = await res.json();
          if (!result.ok) throw new Error(result.error || 'Erreur serveur');
          lastErr = null;
          break;
        } catch (e) { lastErr = e; await sleep(900); }
      }
      if (lastErr) throw lastErr;
    }
    LS.set(KEY_SENT, { date: new Date().toISOString(), answers: answers });
    LS.del(KEY_DRAFT);
    return result;
  }

  /** Résumé lisible : [{id, label, value}] dans l'ordre des questions. */
  function summary(answers) {
    const out = [];
    EV.questions.forEach(function (q) {
      if (!(q.id in answers)) return;
      let v = answers[q.id];
      const extra = answers[q.id + '_autre'];
      if (Array.isArray(v)) v = v.map(function (x) { return x === (otherCfg(q) || {}).label && extra ? x + ' (' + extra + ')' : x; });
      else if (otherCfg(q) && v === otherCfg(q).label && extra) v = v + ' (' + extra + ')';
      // libellés d'options plutôt que valeurs
      const opts = normOptions(q);
      const lab = function (x) { const o = opts.find(function (o) { return o.value === x; }); return o ? o.label : x; };
      out.push({ id: q.id, label: q.summaryLabel || q.label, icon: q.icon || '', value: Array.isArray(v) ? v.map(lab).join(' · ') : String(lab(v)) });
    });
    return out;
  }

  async function count() {
    if (P.preview) return null;
    try {
      const r = await fetch(EV.endpoint + '?action=count&event=' + encodeURIComponent(EV.slug));
      const d = await r.json();
      return d.ok ? d.count : null;
    } catch (e) { return null; }
  }

  /* ---------- montage ---------- */

  function mount(container) {
    formEl = container.tagName === 'FORM' ? container : el('form', { novalidate: true });
    if (formEl !== container) container.appendChild(formEl);
    formEl.setAttribute('novalidate', '');
    formEl.classList.add('sis2-form');
    EV.questions.forEach(function (q, i) { formEl.appendChild(renderQuestion(q, i)); });
    // pot de miel invisible pour les robots
    formEl.appendChild(el('div', { class: 'hp', 'aria-hidden': 'true', style: 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden' }, [
      el('input', { type: 'text', name: '_website', tabindex: '-1', autocomplete: 'off' })
    ]));
    const restored = restoreDraft();
    applyConditions();
    function clearError(e) {
      const q = e.target.closest && e.target.closest('.q');
      if (q && q.classList.contains('q--invalid')) { q.classList.remove('q--invalid'); $('.q__error', q).textContent = ''; }
    }
    formEl.addEventListener('input', function (e) { clearError(e); applyConditions(); saveDraft(); });
    formEl.addEventListener('change', function (e) { clearError(e); applyConditions(); saveDraft(); });
    return { form: formEl, restored: restored };
  }

  function reset() {
    LS.del(KEY_DRAFT);
    if (formEl) { formEl.reset(); applyConditions(); }
  }

  /* ---------- musique & sons ---------- */

  let ctx = null;
  function audioCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const music = {
    playing: false,
    generator: null,          // fourni par le thème : { start(ctx, out), stop() }
    audio: null,
    gain: null,
    muted: LS.get(KEY_MUTE) === true,
    volume: (EV.music && EV.music.volume) || 0.35,
    setGenerator(g) { this.generator = g; },
    start() {
      if (this.muted || this.playing) return;
      const src = EV.music && EV.music.src;
      if (src) {
        if (!this.audio) { this.audio = new Audio(src); this.audio.loop = true; this.audio.volume = this.volume; }
        this.audio.play().catch(function () { /* autoplay refusé */ });
      } else if (this.generator) {
        const c = audioCtx(); if (!c) return;
        this.gain = c.createGain();
        this.gain.gain.setValueAtTime(0, c.currentTime);
        this.gain.gain.linearRampToValueAtTime(this.volume, c.currentTime + 2.5);
        this.gain.connect(c.destination);
        this.generator.start(c, this.gain);
      } else return;
      this.playing = true;
      document.documentElement.classList.add('music-on');
    },
    stop() {
      if (!this.playing) return;
      if (this.audio) this.audio.pause();
      if (this.generator && this.gain) {
        const g = this.gain, c = ctx, gen = this.generator;
        g.gain.cancelScheduledValues(c.currentTime);
        g.gain.setValueAtTime(g.gain.value, c.currentTime);
        g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
        setTimeout(function () { gen.stop(); g.disconnect(); }, 700);
      }
      this.playing = false;
      document.documentElement.classList.remove('music-on');
    },
    toggle() {
      if (this.playing) { this.muted = true; this.stop(); } else { this.muted = false; this.start(); }
      LS.set(KEY_MUTE, this.muted);
      return this.playing;
    }
  };

  /** Bouton musique flottant (le thème le stylise via .music-toggle). */
  function musicButton(labels) {
    labels = labels || { on: '♪', off: '♪̸' };
    const b = el('button', { type: 'button', class: 'music-toggle', 'aria-label': 'Musique' }, [el('span', { class: 'music-toggle__icon' })]);
    function sync() {
      b.classList.toggle('is-on', music.playing);
      b.setAttribute('aria-pressed', String(music.playing));
      b.querySelector('.music-toggle__icon').textContent = music.playing ? labels.on : labels.off;
      b.title = music.playing ? 'Couper la musique' : 'Lancer la musique';
    }
    b.addEventListener('click', function () { music.toggle(); sync(); });
    sync();
    document.body.appendChild(b);
    return { button: b, sync: sync };
  }

  /* ---------- API publique ---------- */

  const deadline = EV.deadline ? new Date(EV.deadline) : null;
  const P = window.Platform = {
    event: EV,
    preview: !EV.endpoint || params.has('apercu') || params.has('preview'),
    closed: !!(deadline && Date.now() > deadline.getTime()) && !params.has('apercu'),
    el: el, $: $, $$: $$, sleep: sleep, roman: roman,
    mount: mount, collect: collect, validate: validate, submit: submit,
    summary: summary, count: count, reset: reset, nameFrom: nameFrom,
    previous: function () { return LS.get(KEY_SENT); },
    hasDraft: function () { return !!LS.get(KEY_DRAFT); },
    music: music, musicButton: musicButton, audioCtx: audioCtx,
    text: function (key, fallback) { return (EV.texts && EV.texts[key] != null) ? EV.texts[key] : fallback; },
    reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  document.documentElement.classList.toggle('is-preview', P.preview);
  if (P.preview) {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.appendChild(el('div', { class: 'preview-badge', text: 'Mode aperçu · rien n’est envoyé' }));
    });
  }
})();
