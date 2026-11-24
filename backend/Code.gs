/**
 * ============================================================
 *  SiS2 Events — backend (Google Apps Script)
 * ============================================================
 *  - Reçoit les réponses des formulaires (POST) et les range
 *    dans le Google Sheet lié, un onglet par événement.
 *  - T'envoie un mail à chaque nouvelle réponse.
 *  - Sert les réponses au dashboard organisateur, uniquement
 *    avec la clé admin (stockée dans les propriétés du script,
 *    jamais dans le code ni sur GitHub).
 *
 *  Installation : voir README.md, section « Backend Google ».
 *  Propriétés du script (Paramètres du projet → Propriétés) :
 *    ADMIN_KEY     → générée par setup()
 *    NOTIFY_EMAIL  → adresse qui reçoit les notifications
 *    SITE_URL      → ex. https://m0nkzzz.github.io/sis2-events
 * ============================================================
 */

const PROPS = PropertiesService.getScriptProperties();
const MAX_PAYLOAD = 30000;      // octets
const MAX_FIELDS = 40;
const MAX_VALUE = 2000;          // caractères par réponse
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
const FIXED_COLS = ['_id', '_date', '_nom'];
const RAW_COL = '_raw';

/* ---------- Points d'entrée HTTP ---------- */

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_PAYLOAD) return json_({ ok: false, error: 'payload_too_large' });
    const body = JSON.parse(raw);
    if (body.action === 'delete') return json_(deleteEntry_(body));
    return json_(submit_(body));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'list') return json_(list_(p));
    if (p.action === 'count') return json_(count_(p));
    return json_({ ok: true, service: 'sis2-events' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ---------- Réception d'une réponse ---------- */

function submit_(body) {
  const slug = String(body.event || '');
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'bad_event' };

  // Pot de miel anti-robot : on fait semblant que tout va bien.
  if (body.hp) return { ok: true, id: 'ok' };

  const answers = sanitizeAnswers_(body.answers);
  const name = clip_(body.name || '', 120);
  const meta = body.meta || {};

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let id, total;
  try {
    const sheet = sheetFor_(slug);
    const headers = ensureHeaders_(sheet, Object.keys(answers));
    id = Utilities.getUuid().slice(0, 8);
    const now = new Date();
    const row = headers.map(function (h) {
      if (h === '_id') return id;
      if (h === '_date') return now;
      if (h === '_nom') return name;
      if (h === RAW_COL) return JSON.stringify(answers);
      const v = answers[h];
      if (v === undefined) return '';
      return Array.isArray(v) ? v.join(' | ') : v;
    });
    sheet.appendRow(row);
    total = sheet.getLastRow() - 1;
  } finally {
    lock.releaseLock();
  }

  try { notify_(slug, name, answers, meta, total); } catch (err) { console.warn('Mail non envoyé : ' + err); }
  return { ok: true, id: id, count: total };
}

function sanitizeAnswers_(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Object.keys(input).slice(0, MAX_FIELDS).forEach(function (k) {
    if (!KEY_RE.test(k)) return;
    const v = input[k];
    if (Array.isArray(v)) out[k] = v.slice(0, 30).map(function (x) { return clip_(x, 300); });
    else if (typeof v === 'number' && isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 'oui' : 'non';
    else if (v != null) out[k] = clip_(v, MAX_VALUE);
  });
  return out;
}

/* ---------- Lecture admin ---------- */

function list_(p) {
  checkKey_(p.key);
  const ss = SpreadsheetApp.getActive();
  const events = ss.getSheets()
    .map(function (s) { return { slug: s.getName(), count: Math.max(0, s.getLastRow() - 1) }; })
    .filter(function (x) { return SLUG_RE.test(x.slug); });

  const slug = String(p.event || '');
  if (!SLUG_RE.test(slug)) return { ok: true, events: events, rows: [] };
  const sheet = ss.getSheetByName(slug);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, events: events, rows: [] };

  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const iId = headers.indexOf('_id'), iDate = headers.indexOf('_date'),
        iName = headers.indexOf('_nom'), iRaw = headers.indexOf(RAW_COL);
  const rows = values.map(function (r) {
    let answers = {};
    try { answers = JSON.parse(r[iRaw] || '{}'); } catch (e) { /* ligne éditée à la main */ }
    // Si tu modifies une cellule dans le Sheet, la colonne lisible fait foi.
    headers.forEach(function (h, i) {
      if (h.charAt(0) === '_' || r[i] === '' || r[i] == null) return;
      const cell = String(r[i]);
      const prev = answers[h];
      if (Array.isArray(prev)) { if (prev.join(' | ') !== cell) answers[h] = cell.split(' | '); }
      else if (prev === undefined || String(prev) !== cell) answers[h] = r[i];
    });
    const d = r[iDate];
    return {
      id: String(r[iId]),
      date: d instanceof Date ? d.toISOString() : String(d),
      name: String(r[iName] || ''),
      answers: answers
    };
  });
  return { ok: true, events: events, rows: rows };
}

function count_(p) {
  const slug = String(p.event || '');
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'bad_event' };
  const sheet = SpreadsheetApp.getActive().getSheetByName(slug);
  return { ok: true, count: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0 };
}

function deleteEntry_(body) {
  checkKey_(body.key);
  const slug = String(body.event || '');
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'bad_event' };
  const sheet = SpreadsheetApp.getActive().getSheetByName(slug);
  if (!sheet) return { ok: false, error: 'not_found' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (let i = ids.length - 1; i >= 1; i--) {
      if (String(ids[i][0]) === String(body.id)) { sheet.deleteRow(i + 1); return { ok: true }; }
    }
  } finally { lock.releaseLock(); }
  return { ok: false, error: 'not_found' };
}

function checkKey_(key) {
  const expected = PROPS.getProperty('ADMIN_KEY');
  if (!expected) throw new Error('admin_key_not_set');
  if (String(key || '') !== expected) {
    Utilities.sleep(800); // freine les essais en rafale
    throw new Error('bad_key');
  }
}

/* ---------- Notification mail ---------- */

function notify_(slug, name, answers, meta, total) {
  const to = PROPS.getProperty('NOTIFY_EMAIL');
  if (!to) return;
  const title = clip_(meta.title || slug, 120);
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(meta.accent || '') ? meta.accent : '#8b1e1e';
  const labels = (meta.labels && typeof meta.labels === 'object') ? meta.labels : {};
  const site = (PROPS.getProperty('SITE_URL') || '').replace(/\/$/, '');
  const adminUrl = site ? site + '/events/' + slug + '/admin.html' : '';

  const rows = Object.keys(answers).map(function (k) {
    const v = answers[k];
    const val = Array.isArray(v) ? v.join(', ') : String(v);
    return '<tr><td style="padding:8px 12px;color:#666;vertical-align:top;white-space:nowrap">' +
      esc_(clip_(labels[k] || k, 80)) + '</td><td style="padding:8px 12px;color:#111">' +
      esc_(val).replace(/\n/g, '<br>') + '</td></tr>';
  }).join('');

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden">' +
      '<div style="background:' + accent + ';color:#fff;padding:18px 20px">' +
        '<div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.08em">Nouvelle réponse · ' + esc_(title) + '</div>' +
        '<div style="font-size:22px;font-weight:bold;margin-top:4px">' + esc_(name || 'Anonyme') + '</div>' +
      '</div>' +
      '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rows + '</table>' +
      '<div style="padding:14px 20px;background:#f6f6f6;font-size:13px;color:#555">' +
        'Total : <b>' + total + '</b> réponse' + (total > 1 ? 's' : '') +
        (adminUrl ? ' · <a href="' + esc_(adminUrl) + '" style="color:' + accent + '">Ouvrir le dashboard</a>' : '') +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: to,
    subject: '[' + title + '] ' + (name || 'Nouvelle réponse') + ' a répondu (' + total + ')',
    htmlBody: html,
    name: 'SiS2 Events'
  });
}

/* ---------- Utilitaires ---------- */

function sheetFor_(slug) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(slug);
  if (!sheet) {
    sheet = ss.insertSheet(slug);
    sheet.appendRow(FIXED_COLS.concat([RAW_COL]));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  return sheet;
}

function ensureHeaders_(sheet, keys) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = keys.filter(function (k) { return headers.indexOf(k) === -1; });
  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    return headers.concat(missing);
  }
  return headers;
}

function clip_(v, n) { return String(v).slice(0, n); }

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- À lancer à la main depuis l'éditeur ---------- */

/** 1re installation : crée ta clé admin et l'affiche dans le journal d'exécution. */
function setup() {
  let key = PROPS.getProperty('ADMIN_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    PROPS.setProperty('ADMIN_KEY', key);
  }
  if (!PROPS.getProperty('NOTIFY_EMAIL')) PROPS.setProperty('NOTIFY_EMAIL', Session.getActiveUser().getEmail());
  console.log('Clé admin : ' + key);
  console.log('Notifications envoyées à : ' + PROPS.getProperty('NOTIFY_EMAIL'));
}

/** Génère une nouvelle clé admin (si l'ancienne a fuité). */
function resetAdminKey() {
  PROPS.deleteProperty('ADMIN_KEY');
  setup();
}

/** Envoie-toi un mail de test pour vérifier les notifications. */
function testNotification() {
  notify_('test', 'Messire Test', { presence: 'Oui', jeux: ['Loup-Garou', 'Among Us'], message: 'Ceci est un test.' },
    { title: 'Test SiS2 Events', accent: '#8b1e1e' }, 1);
}
