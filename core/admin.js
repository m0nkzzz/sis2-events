/* ============================================================
 *  SiS2 Events — dashboard organisateur
 *  Lit window.EVENT, récupère les réponses via le backend Google
 *  (clé admin obligatoire), calcule les stats et affiche tout.
 *  Tous les textes venant des réponses passent par textContent.
 * ============================================================ */
(function () {
  'use strict';

  const EV = window.EVENT;
  const params = new URLSearchParams(location.search);
  const DEMO = !EV.endpoint || params.has('demo');
  const KEY_STORE = 'sis2:admin-key';
  const KEY_SEEN = 'sis2:' + EV.slug + ':admin-seen';
  const REFRESH_MS = 60000;

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* rien */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* rien */ } }
  };

  /* ---------- utilitaires DOM ---------- */
  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const fmtPct = function (x) { return (Math.round(x * 1000) / 10).toLocaleString('fr-CH') + ' %'; };
  const dateFmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short' });
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'à l’instant';
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    return 'il y a ' + Math.floor(s / 86400) + ' j';
  }
  const norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };

  function options(q) {
    return (q.options || []).map(function (o) { return typeof o === 'string' ? { value: o, label: o } : Object.assign({ label: o.value }, o); });
  }
  function otherLabel(q) { return q.other ? ((q.other !== true && q.other.label) || 'Autre') : null; }
  const isChoice = function (q) { return ['multi', 'choice', 'select'].indexOf(q.type) !== -1; };
  const nameQ = EV.questions.find(function (q) { return q.role === 'name'; });

  /* ---------- état ---------- */
  const state = { rows: [], events: [], latestOnly: true, filter: null, search: '', sort: { key: '_date', dir: -1 }, lastSeen: Number(LS.get(KEY_SEEN) || 0), loadedAt: null, timer: null };

  /* ---------- API ---------- */
  async function api(params) {
    const url = EV.endpoint + '?' + new URLSearchParams(params).toString();
    const r = await fetch(url);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Erreur');
    return d;
  }
  async function apiPost(body) {
    const r = await fetch(EV.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Erreur');
    return d;
  }

  function demoRows() {
    const names = ['Lucie Vuille', 'Marc Perrenoud', 'Sofia Rossi', 'Kevin Jeanneret', 'Amélie Ducommun', 'Yannick Robert', 'Inès Matthey', 'Bruno Calame', 'Léa Huguenin', 'Tiago Ferreira', 'Nora Favre', 'Julien Monnier'];
    const rnd = function (seed) { let x = seed; return function () { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }(42);
    return names.map(function (n, i) {
      const answers = {};
      EV.questions.forEach(function (q) {
        const opts = options(q).map(function (o) { return o.value; });
        if (q.role === 'name') answers[q.id] = n;
        else if (q.type === 'multi') {
          const pick = opts.filter(function (_, j) { return rnd() < (j === 1 ? 0.75 : 0.42); });
          answers[q.id] = pick.length ? pick : [opts[0]];
          if (q.other && rnd() < 0.2) { answers[q.id].push(otherLabel(q)); answers[q.id + '_autre'] = ['Blind test', 'Mario Kart', 'Karaoké'][i % 3]; }
        } else if (q.type === 'choice' || q.type === 'select') answers[q.id] = opts[Math.floor(Math.pow(rnd(), 1.6) * opts.length)];
        else if (q.type === 'number') answers[q.id] = Math.floor(rnd() * 3);
        else if (q.type === 'textarea' && rnd() < 0.4) answers[q.id] = ['Je ramène des chips !', 'Allergique aux noix.', 'Je peux amener ma Switch.', 'Hâte !'][i % 4];
      });
      return { id: 'demo' + i, date: new Date(Date.now() - (names.length - i) * 7.3 * 3600e3).toISOString(), name: n, answers: answers };
    });
  }

  async function load(silent) {
    const btn = $('#a-refresh');
    if (btn) btn.classList.add('is-loading');
    try {
      if (DEMO) { state.rows = state.rows.length ? state.rows : demoRows(); state.events = []; }
      else {
        const d = await api({ action: 'list', event: EV.slug, key: LS.get(KEY_STORE) });
        state.rows = d.rows; state.events = d.events || [];
      }
      state.loadedAt = new Date();
      render();
    } catch (e) {
      if (e.message === 'bad_key') { LS.del(KEY_STORE); showGate('Clé incorrecte.'); }
      else if (!silent) toast('Impossible de charger : ' + e.message);
    } finally { if (btn) btn.classList.remove('is-loading'); }
  }

  /* ---------- stats ---------- */
  function statsFor(q, rows) {
    const opts = options(q);
    const counts = new Map(opts.map(function (o) { return [o.value, { value: o.value, label: o.label, icon: o.icon, n: 0, who: [] }]; }));
    const ol = otherLabel(q);
    if (ol) counts.set(ol, { value: ol, label: ol, icon: q.other.icon, n: 0, who: [], other: true });
    let answered = 0;
    const others = [];
    rows.forEach(function (r) {
      let v = r.answers[q.id];
      if (v == null || v === '') return;
      answered++;
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        x = String(x);
        if (!counts.has(x)) counts.set(x, { value: x, label: x, n: 0, who: [] });
        const c = counts.get(x); c.n++; c.who.push(r.name || '—');
      });
      if (r.answers[q.id + '_autre']) others.push({ who: r.name, text: String(r.answers[q.id + '_autre']) });
    });
    const list = Array.from(counts.values()).sort(function (a, b) { return b.n - a.n; });
    return { list: list, answered: answered, others: others, max: list.length ? list[0].n : 0 };
  }

  /** Une seule réponse par personne (la plus récente) si latestOnly est actif. */
  function activeRows() {
    if (!state.latestOnly) return state.rows.slice();
    const best = new Map();
    state.rows.forEach(function (r) {
      const k = norm(r.name) || r.id;
      const cur = best.get(k);
      if (!cur || r.date > cur.date) best.set(k, r);
    });
    return state.rows.filter(function (r) { return best.get(norm(r.name) || r.id) === r; });
  }

  function filteredRows() {
    let rows = activeRows();
    if (state.filter) rows = rows.filter(function (r) {
      const v = r.answers[state.filter.q];
      return Array.isArray(v) ? v.map(String).indexOf(state.filter.value) !== -1 : String(v) === state.filter.value;
    });
    if (state.search) {
      const s = norm(state.search);
      rows = rows.filter(function (r) { return norm(r.name + ' ' + JSON.stringify(r.answers)).indexOf(s) !== -1; });
    }
    const k = state.sort.key, dir = state.sort.dir;
    rows.sort(function (a, b) {
      const va = k === '_date' ? a.date : k === '_name' ? norm(a.name) : String(a.answers[k] || '');
      const vb = k === '_date' ? b.date : k === '_name' ? norm(b.name) : String(b.answers[k] || '');
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    return rows;
  }

  /* ---------- rendu ---------- */
  function render() {
    const rows = activeRows();
    const root = $('#a-main');
    root.replaceChildren();
    $('#a-updated').textContent = state.loadedAt ? 'Mis à jour ' + state.loadedAt.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : '';
    const fresh = rows.filter(function (r) { return new Date(r.date).getTime() > state.lastSeen; }).length;
    document.title = (fresh && state.lastSeen ? '(' + fresh + ') ' : '') + 'Dashboard · ' + EV.title;

    root.appendChild(renderKpis(rows, fresh));
    if (!rows.length) {
      root.appendChild(el('div', { class: 'a-empty a-panel' }, [
        el('div', { class: 'a-empty__icon', text: '🕊️' }),
        el('p', { text: 'Aucune réponse pour l’instant.' }),
        el('p', { class: 'a-muted', text: 'Partage le lien du formulaire, les réponses apparaîtront ici automatiquement.' })
      ]));
      return;
    }
    root.appendChild(renderTimeline(rows));
    const grid = el('div', { class: 'a-grid' });
    EV.questions.forEach(function (q) {
      if (q.role === 'name' || q.adminHidden) return;
      if (isChoice(q)) grid.appendChild(renderChoicePanel(q, rows));
      else if (q.type === 'number') grid.appendChild(renderNumberPanel(q, rows));
      else grid.appendChild(renderTextPanel(q, rows));
    });
    root.appendChild(grid);
    root.appendChild(renderTable());
  }

  function kpi(label, value, sub, cls) {
    return el('div', { class: 'a-kpi' + (cls ? ' ' + cls : '') }, [
      el('div', { class: 'a-kpi__label', text: label }),
      el('div', { class: 'a-kpi__value', text: value }),
      sub ? el('div', { class: 'a-kpi__sub', text: sub }) : null
    ]);
  }

  function renderKpis(rows, fresh) {
    const wrap = el('section', { class: 'a-kpis' });
    const last = rows.reduce(function (m, r) { return !m || r.date > m ? r.date : m; }, null);
    const day = rows.filter(function (r) { return Date.now() - new Date(r.date).getTime() < 86400e3; }).length;
    const extra = state.rows.length - rows.length;
    wrap.appendChild(kpi(state.latestOnly ? 'Participants' : 'Réponses', String(rows.length),
      fresh && state.lastSeen ? '+' + fresh + ' depuis ta dernière visite'
        : EV.expected ? 'sur ' + EV.expected + ' attendu·e·s'
        : extra > 0 ? extra + ' ancienne' + (extra > 1 ? 's' : '') + ' version' + (extra > 1 ? 's' : '') + ' ignorée' + (extra > 1 ? 's' : '') : null, 'a-kpi--hero'));
    wrap.appendChild(kpi('Dernières 24 h', String(day), last ? 'dernière ' + ago(last) : '—'));
    (EV.admin && EV.admin.highlights || []).forEach(function (h) {
      const q = EV.questions.find(function (x) { return x.id === h.q; });
      if (!q || !rows.length) return;
      const s = statsFor(q, rows);
      const top = s.list[0];
      if (!top || !top.n) return;
      const ties = s.list.filter(function (x) { return x.n === top.n; }).length;
      wrap.appendChild(kpi(h.label || q.label, (top.icon ? top.icon + ' ' : '') + top.label,
        top.n + '/' + s.answered + ' · ' + fmtPct(top.n / Math.max(1, s.answered)) + (ties > 1 ? ' · égalité ×' + ties : '')));
    });
    if (EV.deadline) {
      const ms = new Date(EV.deadline).getTime() - Date.now();
      wrap.appendChild(kpi('Clôture', ms > 0 ? (ms > 86400e3 ? Math.ceil(ms / 86400e3) + ' j' : Math.ceil(ms / 3600e3) + ' h') : 'Fermé', dateFmt.format(new Date(EV.deadline))));
    }
    return wrap;
  }

  function renderTimeline(rows) {
    // une barre par jour, du premier jour de réponse à aujourd'hui (max 21 jours)
    const byDay = new Map();
    rows.forEach(function (r) { const d = new Date(r.date); const k = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); byDay.set(k, (byDay.get(k) || 0) + 1); });
    const keys = Array.from(byDay.keys()).sort();
    const start = Math.max(keys[0], new Date().setHours(0, 0, 0, 0) - 20 * 86400e3);
    const days = [];
    for (let t = start; t <= new Date().setHours(0, 0, 0, 0); t += 86400e3) days.push({ t: t, n: byDay.get(t) || 0 });
    const max = Math.max.apply(null, days.map(function (d) { return d.n; }).concat([1]));
    const chart = el('div', { class: 'a-timeline__bars', role: 'img', 'aria-label': 'Réponses par jour' });
    days.forEach(function (d) {
      chart.appendChild(el('div', { class: 'a-timeline__col', tabindex: '0', 'data-tip': dayFmt.format(new Date(d.t)) + ' : ' + d.n + ' réponse' + (d.n > 1 ? 's' : '') }, [
        el('div', { class: 'a-timeline__bar' + (d.n ? '' : ' is-zero'), style: { height: (d.n / max * 100) + '%' } }),
        el('div', { class: 'a-timeline__day', text: dayFmt.format(new Date(d.t)).replace('.', '') })
      ]));
    });
    return el('section', { class: 'a-panel a-timeline' }, [
      el('h3', { class: 'a-panel__title', text: 'Arrivée des réponses' }),
      chart
    ]);
  }

  function renderChoicePanel(q, rows) {
    const s = statsFor(q, rows);
    const panel = el('section', { class: 'a-panel a-panel--choice' });
    panel.appendChild(el('h3', { class: 'a-panel__title' }, [q.icon ? el('span', { class: 'a-panel__icon', text: q.icon }) : null, q.label]));
    panel.appendChild(el('p', { class: 'a-panel__meta', text: s.answered + ' réponse' + (s.answered > 1 ? 's' : '') + (q.type === 'multi' ? ' · plusieurs choix possibles, % = part des répondants' : '') }));
    const list = el('ol', { class: 'a-bars' });
    s.list.forEach(function (o, i) {
      if (!o.n && o.other) return;
      const pct = s.answered ? o.n / s.answered : 0;
      const active = state.filter && state.filter.q === q.id && state.filter.value === o.value;
      const lead = o.n && o.n === s.max;
      const item = el('li', {
        class: 'a-bar' + (lead ? ' is-lead' : '') + (active ? ' is-active' : '') + (!o.n ? ' is-zero' : ''),
        tabindex: '0', role: 'button',
        'aria-label': o.label + ' : ' + o.n + ' (' + fmtPct(pct) + '). Cliquer pour filtrer la liste.',
        'data-tip': o.who.length ? o.who.join(', ') : 'Personne pour l’instant',
        onclick: function () { setFilter(q, o); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(q, o); } }
      }, [
        el('div', { class: 'a-bar__head' }, [
          el('span', { class: 'a-bar__label' }, [o.icon ? o.icon + ' ' : '', o.label, lead ? el('span', { class: 'a-bar__crown', title: 'En tête', text: ' ★' }) : null]),
          el('span', { class: 'a-bar__val' }, [el('b', { text: String(o.n) }), ' · ' + fmtPct(pct)])
        ]),
        el('div', { class: 'a-bar__track' }, [el('div', { class: 'a-bar__fill', style: { width: (pct * 100) + '%' } })])
      ]);
      list.appendChild(item);
    });
    panel.appendChild(list);
    if (s.others.length) {
      panel.appendChild(el('div', { class: 'a-others' }, [
        el('div', { class: 'a-others__title', text: 'Propositions « ' + otherLabel(q) + ' »' }),
        el('ul', null, s.others.map(function (o) { return el('li', null, [el('b', { text: o.text }), el('span', { class: 'a-muted', text: ' — ' + (o.who || '?') })]); }))
      ]));
    }
    return panel;
  }

  function renderNumberPanel(q, rows) {
    const vals = rows.map(function (r) { return Number(r.answers[q.id]); }).filter(function (x) { return isFinite(x); });
    const sum = vals.reduce(function (a, b) { return a + b; }, 0);
    return el('section', { class: 'a-panel' }, [
      el('h3', { class: 'a-panel__title' }, [q.icon ? el('span', { class: 'a-panel__icon', text: q.icon }) : null, q.label]),
      el('div', { class: 'a-numbers' }, [
        kpi('Total', String(sum)), kpi('Moyenne', vals.length ? (sum / vals.length).toFixed(1) : '—'),
        kpi('Min', vals.length ? String(Math.min.apply(null, vals)) : '—'), kpi('Max', vals.length ? String(Math.max.apply(null, vals)) : '—')
      ])
    ]);
  }

  function renderTextPanel(q, rows) {
    const items = rows.filter(function (r) { return r.answers[q.id]; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return el('section', { class: 'a-panel a-panel--text' }, [
      el('h3', { class: 'a-panel__title' }, [q.icon ? el('span', { class: 'a-panel__icon', text: q.icon }) : null, q.label]),
      el('p', { class: 'a-panel__meta', text: items.length + ' message' + (items.length > 1 ? 's' : '') }),
      items.length ? el('ul', { class: 'a-quotes' }, items.map(function (r) {
        return el('li', { class: 'a-quote' }, [el('p', { text: String(r.answers[q.id]) }), el('span', { class: 'a-quote__who', text: '— ' + (r.name || 'Anonyme') })]);
      })) : el('p', { class: 'a-muted', text: 'Rien pour l’instant.' })
    ]);
  }

  function setFilter(q, o) {
    state.filter = (state.filter && state.filter.q === q.id && state.filter.value === o.value) ? null : { q: q.id, value: o.value, label: q.label + ' : ' + o.label };
    render();
    if (state.filter) $('#a-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cellText(q, r) {
    const v = r.answers[q.id];
    if (v == null) return '';
    let s = Array.isArray(v) ? v.join(', ') : String(v);
    if (r.answers[q.id + '_autre']) s += ' (' + r.answers[q.id + '_autre'] + ')';
    return s;
  }

  function renderTable() {
    const rows = filteredRows();
    const cols = EV.questions.filter(function (q) { return q.role !== 'name' && !q.adminHidden; });
    const nameCount = {};
    state.rows.forEach(function (r) { const k = norm(r.name); nameCount[k] = (nameCount[k] || 0) + 1; });

    const head = el('div', { class: 'a-table__head' }, [
      el('h3', { class: 'a-panel__title', text: 'Liste des réponses' }),
      el('div', { class: 'a-table__tools' }, [
        state.filter ? el('button', { class: 'a-chip', type: 'button', onclick: function () { state.filter = null; render(); } }, [state.filter.label + '  ✕']) : null,
        el('input', {
          class: 'a-input', type: 'search', placeholder: 'Rechercher…', value: state.search, 'aria-label': 'Rechercher une réponse',
          oninput: function (e) { state.search = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#a-table input[type=search]'); i.focus(); i.setSelectionRange(pos, pos); }
        }),
        el('label', { class: 'a-check', title: 'Si quelqu’un a répondu plusieurs fois, seule sa réponse la plus récente compte dans les stats.' }, [
          el('input', { type: 'checkbox', checked: state.latestOnly, onchange: function (e) { state.latestOnly = e.target.checked; render(); } }),
          ' Dernière réponse par personne'
        ]),
        el('span', { class: 'a-muted', text: rows.length + ' / ' + state.rows.length })
      ])
    ]);

    function th(label, key) {
      const active = state.sort.key === key;
      return el('th', { 'aria-sort': active ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none' }, [
        el('button', { type: 'button', class: 'a-sort' + (active ? ' is-active' : ''), onclick: function () {
          state.sort = { key: key, dir: active ? -state.sort.dir : (key === '_date' ? -1 : 1) }; render();
        } }, [label, active ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : ''])
      ]);
    }
    const table = el('table', { class: 'a-table' }, [
      el('thead', null, [el('tr', null, [th(nameQ ? (nameQ.summaryLabel || 'Nom') : 'Nom', '_name'), th('Reçu', '_date')]
        .concat(cols.map(function (q) { return th(q.short || q.summaryLabel || q.label, q.id); }))
        .concat([el('th', { class: 'a-table__actions-h', text: '' })]))]),
      el('tbody', null, rows.map(function (r) {
        const isNew = state.lastSeen && new Date(r.date).getTime() > state.lastSeen;
        const dup = !state.latestOnly && nameCount[norm(r.name)] > 1;
        return el('tr', { class: isNew ? 'is-new' : '' }, [
          el('td', { class: 'a-table__name' }, [
            el('button', { type: 'button', class: 'a-link', text: r.name || 'Anonyme', onclick: function () { openDetail(r); } }),
            isNew ? el('span', { class: 'a-badge a-badge--new', text: 'nouveau' }) : null,
            dup ? el('span', { class: 'a-badge a-badge--warn', title: 'Même nom que une autre réponse', text: 'doublon ?' }) : null
          ]),
          el('td', { class: 'a-table__date', text: dateFmt.format(new Date(r.date)) })
        ].concat(cols.map(function (q) { return el('td', { text: cellText(q, r) }); }))
          .concat([el('td', { class: 'a-table__actions' }, [deleteButton(r)])]));
      }))
    ]);
    return el('section', { class: 'a-panel a-tablewrap', id: 'a-table' }, [head, el('div', { class: 'a-scroll' }, [table])]);
  }

  function deleteButton(r) {
    const b = el('button', { type: 'button', class: 'a-btn a-btn--ghost a-btn--danger', text: 'Supprimer', 'aria-label': 'Supprimer la réponse de ' + (r.name || 'Anonyme') });
    let armed = false, t;
    b.addEventListener('click', async function () {
      if (!armed) { armed = true; b.textContent = 'Confirmer ?'; b.classList.add('is-armed'); t = setTimeout(function () { armed = false; b.textContent = 'Supprimer'; b.classList.remove('is-armed'); }, 3500); return; }
      clearTimeout(t); b.disabled = true; b.textContent = '…';
      try {
        if (!DEMO) await apiPost({ action: 'delete', key: LS.get(KEY_STORE), event: EV.slug, id: r.id });
        state.rows = state.rows.filter(function (x) { return x.id !== r.id; });
        render(); toast('Réponse supprimée.');
      } catch (e) { toast('Suppression impossible : ' + e.message); b.disabled = false; b.textContent = 'Supprimer'; }
    });
    return b;
  }

  function openDetail(r) {
    const dlg = $('#a-detail');
    const body = $('#a-detail-body');
    body.replaceChildren(
      el('h3', { class: 'a-detail__name', text: r.name || 'Anonyme' }),
      el('p', { class: 'a-muted', text: 'Reçu le ' + dateFmt.format(new Date(r.date)) + ' · id ' + r.id }),
      el('dl', { class: 'a-detail__list' }, EV.questions.filter(function (q) { return q.role !== 'name'; }).reduce(function (acc, q) {
        acc.push(el('dt', null, [q.icon ? q.icon + ' ' : '', q.label]));
        acc.push(el('dd', { text: cellText(q, r) || '—' }));
        return acc;
      }, []))
    );
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  /* ---------- export ---------- */
  function exportCsv() {
    const cols = EV.questions.filter(function (q) { return q.role !== 'name'; });
    const head = ['Nom', 'Date'].concat(cols.map(function (q) { return q.label; }));
    const lines = [head].concat(state.rows.map(function (r) {
      return [r.name, new Date(r.date).toLocaleString('fr-CH')].concat(cols.map(function (q) { return cellText(q, r); }));
    })).map(function (row) {
      return row.map(function (c) {
        let s = String(c == null ? '' : c);
        if (/^[=+\-@]/.test(s)) s = "'" + s;            // pas de formules injectées dans Excel
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(';');
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: EV.slug + '-reponses.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function copyNames() {
    const names = state.rows.map(function (r) { return r.name; }).filter(Boolean).join(', ');
    copy(names, 'Noms copiés (' + state.rows.length + ').');
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg); }, function () { prompt('Copie ce texte :', text); });
  }

  let toastT;
  function toast(msg) {
    const t = $('#a-toast'); t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, 3200);
  }

  /* ---------- tooltip commun ---------- */
  function setupTooltip() {
    const tip = el('div', { class: 'a-tip', role: 'tooltip' });
    document.body.appendChild(tip);
    function show(e) {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tip.classList.remove('is-on'); return; }
      tip.textContent = t.getAttribute('data-tip');
      const r = t.getBoundingClientRect();
      tip.classList.add('is-on');
      const w = tip.offsetWidth;
      tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      tip.style.top = (r.top + window.scrollY - tip.offsetHeight - 8) + 'px';
    }
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) tip.classList.remove('is-on'); });
  }

  /* ---------- connexion ---------- */
  function showGate(err) {
    $('#a-app').hidden = true;
    const g = $('#a-gate');
    g.hidden = false;
    $('#a-gate-error').textContent = err || '';
    setTimeout(function () { $('#a-gate-key').focus(); }, 50);
  }
  async function tryLogin(key) {
    LS.set(KEY_STORE, key);
    $('#a-gate-btn').disabled = true;
    try {
      await api({ action: 'list', event: EV.slug, key: key });
      startApp();
    } catch (e) {
      LS.del(KEY_STORE);
      $('#a-gate-error').textContent = e.message === 'bad_key' ? 'Clé incorrecte.' : e.message === 'admin_key_not_set' ? 'Clé admin pas encore créée : lance setup() dans Apps Script.' : 'Connexion impossible : ' + e.message;
    } finally { $('#a-gate-btn').disabled = false; }
  }

  function startApp() {
    $('#a-gate').hidden = true;
    $('#a-app').hidden = false;
    load();
    clearInterval(state.timer);
    state.timer = setInterval(function () { if (!document.hidden) load(true); }, REFRESH_MS);
  }

  /* ---------- squelette ---------- */
  function buildShell() {
    const formUrl = new URL('./', location.href).href;
    document.body.classList.add('a-body', 'theme-' + (EV.theme || 'default'));
    document.body.appendChild(el('div', { id: 'a-gate', class: 'a-gate', hidden: true }, [
      el('form', { class: 'a-gate__card', onsubmit: function (e) { e.preventDefault(); tryLogin($('#a-gate-key').value.trim()); } }, [
        el('div', { class: 'a-gate__emblem', 'aria-hidden': 'true', text: EV.admin && EV.admin.emblem || '🔒' }),
        el('h1', { class: 'a-gate__title', text: EV.admin && EV.admin.gateTitle || 'Accès organisateur' }),
        el('p', { class: 'a-muted', text: EV.title }),
        el('label', { class: 'a-sr', for: 'a-gate-key', text: 'Clé admin' }),
        el('input', { id: 'a-gate-key', class: 'a-input a-gate__input', type: 'password', placeholder: 'Clé admin', autocomplete: 'current-password', required: true }),
        el('p', { id: 'a-gate-error', class: 'a-gate__error', role: 'alert' }),
        el('button', { id: 'a-gate-btn', class: 'a-btn a-btn--primary', type: 'submit', text: 'Entrer' })
      ])
    ]));

    document.body.appendChild(el('div', { id: 'a-app', class: 'a-app', hidden: true }, [
      el('header', { class: 'a-top' }, [
        el('div', { class: 'a-top__id' }, [
          el('span', { class: 'a-top__emblem', 'aria-hidden': 'true', text: EV.admin && EV.admin.emblem || '◆' }),
          el('div', null, [
            el('div', { class: 'a-top__kicker', text: 'Dashboard organisateur' + (DEMO ? ' · données de démo' : '') }),
            el('h1', { class: 'a-top__title', text: EV.title })
          ])
        ]),
        el('nav', { class: 'a-top__actions' }, [
          el('span', { id: 'a-updated', class: 'a-muted a-top__updated' }),
          el('button', { id: 'a-refresh', class: 'a-btn', type: 'button', text: '↻ Rafraîchir', onclick: function () { load(); } }),
          el('button', { class: 'a-btn', type: 'button', text: 'Copier le lien', onclick: function () { copy(formUrl, 'Lien du formulaire copié.'); } }),
          el('a', { class: 'a-btn', href: formUrl + '?apercu', target: '_blank', rel: 'noopener', text: 'Aperçu du formulaire' }),
          el('button', { class: 'a-btn', type: 'button', text: 'Copier les noms', onclick: copyNames }),
          el('button', { class: 'a-btn a-btn--primary', type: 'button', text: 'Exporter CSV', onclick: exportCsv }),
          DEMO ? null : el('button', { class: 'a-btn a-btn--ghost', type: 'button', text: 'Déconnexion', onclick: function () { LS.del(KEY_STORE); clearInterval(state.timer); showGate(); } })
        ])
      ]),
      el('main', { id: 'a-main', class: 'a-main' })
    ]));

    const dlg = el('dialog', { id: 'a-detail', class: 'a-detail' }, [
      el('div', { id: 'a-detail-body' }),
      el('form', { method: 'dialog' }, [el('button', { class: 'a-btn', text: 'Fermer' })])
    ]);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    document.body.appendChild(el('div', { id: 'a-toast', class: 'a-toast', role: 'status' }));
    setupTooltip();

    // marque « vu » en quittant, pour les badges « nouveau » de la prochaine visite
    window.addEventListener('pagehide', function () { if (state.rows.length) LS.set(KEY_SEEN, String(Date.now())); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildShell();
    if (DEMO || LS.get(KEY_STORE)) startApp(); else showGate();
  });
})();
