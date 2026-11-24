/* ============================================================
 *  Thème « Parchemin » — atelier de dessin procédural
 *  Textures (bois, cuir, papier) calculées pixel par pixel et
 *  objets dessinés en canvas (plume barbe par barbe, encrier en
 *  cristal, bougeoir, dé, enveloppe, cire, pigeon vu de dessus).
 *  Aucune image externe : tout est généré au chargement.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- bruit de Perlin ---------- */
  function Noise(seed) {
    const p = new Uint8Array(512);
    let s = seed || 1;
    const rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const perm = [];
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function n2(x, y) {
      const X = Math.floor(x), Y = Math.floor(y);
      const xf = x - X, yf = y - Y;
      const xi = X & 255, yi = Y & 255;
      const g00 = grad[p[xi + p[yi]] & 7], g10 = grad[p[xi + 1 + p[yi]] & 7];
      const g01 = grad[p[xi + p[yi + 1]] & 7], g11 = grad[p[xi + 1 + p[yi + 1]] & 7];
      const u = fade(xf), v = fade(yf);
      const a = g00[0] * xf + g00[1] * yf, b = g10[0] * (xf - 1) + g10[1] * yf;
      const c = g01[0] * xf + g01[1] * (yf - 1), d = g11[0] * (xf - 1) + g11[1] * (yf - 1);
      return (a + u * (b - a)) + v * ((c + u * (d - c)) - (a + u * (b - a)));
    }
    function fbm(x, y, oct) {
      let v = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < (oct || 4); i++) { v += amp * n2(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
      return v / norm;
    }
    return { n2: n2, fbm: fbm, rnd: rnd };
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- plateau de bureau en noyer ---------- */
  function wood(w, h, k) {
    k = k || 0.5;
    const cw = Math.ceil(w * k), ch = Math.ceil(h * k);
    const c = canvas(cw, ch), x = c.getContext('2d');
    const img = x.createImageData(cw, ch), d = img.data;
    const N = Noise(7), N2 = Noise(31);
    const boardH = 190 * k;
    const tones = [];
    for (let i = 0; i < 40; i++) tones.push(0.86 + N.rnd() * 0.26);
    for (let py = 0; py < ch; py++) {
      const b = Math.floor(py / boardH), v = (py % boardH) / boardH;
      const tone = tones[b % 40];
      for (let px = 0; px < cw; px++) {
        const wx = px / k, wy = py / k;
        const warp = N.fbm(wx * 0.0012 + b * 3.1, wy * 0.006, 3);
        // veines fines et serrées parallèles aux planches
        const ring = Math.sin(wy * 0.32 + warp * 26 + b * 1.7);
        const lines = Math.pow(0.5 + 0.5 * ring, 5);
        const streak = N2.n2(wx * 0.006, wy * 0.9) * 0.5 + N2.n2(wx * 0.02, wy * 2.2) * 0.5;
        const big = N2.fbm(wx * 0.0011, wy * 0.0016, 3);
        const m = 0.5 + big * 0.35 + streak * 0.18;
        let r = lerp(58, 92, m), g = lerp(33, 56, m), bl = lerp(18, 32, m);
        r = lerp(r, 38, lines * 0.32); g = lerp(g, 21, lines * 0.32); bl = lerp(bl, 12, lines * 0.32);
        r *= tone; g *= tone; bl *= tone;
        if (v < 0.006 || v > 0.994) { r *= 0.3; g *= 0.3; bl *= 0.3; }
        else if (v < 0.016) { r *= 1.1; g *= 1.1; bl *= 1.08; }
        const i = (py * cw + px) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    // rayures et usure
    x.globalAlpha = 0.06; x.strokeStyle = '#e0b98a'; x.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      x.lineWidth = 0.4 + N.rnd();
      const sx = N.rnd() * cw, sy = N.rnd() * ch, len = 20 + N.rnd() * 140 * k, a = (N.rnd() - 0.5) * 0.6;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + len * 0.5, sy + Math.sin(a) * len * 0.3, sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
    }
    x.globalAlpha = 0.05; x.fillStyle = '#000';
    for (let i = 0; i < 18; i++) { x.beginPath(); x.arc(N.rnd() * cw, N.rnd() * ch, 6 + N.rnd() * 40 * k, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    return c;
  }

  /* ---------- sous-main en cuir vert, dorure au fer ---------- */
  function leather(w, h) {
    const c = canvas(w, h), x = c.getContext('2d');
    const img = x.createImageData(c.width, c.height), d = img.data;
    const N = Noise(19);
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      const e = Math.min(px, py, c.width - px, c.height - py);
      const pebble = N.n2(px * 0.45, py * 0.45) * 0.6 + N.n2(px * 0.9, py * 0.9) * 0.4;
      const mott = N.fbm(px * 0.01, py * 0.01, 3);
      let r = 30 + mott * 12 + pebble * 7, g = 46 + mott * 16 + pebble * 8, b = 34 + mott * 10 + pebble * 6;
      const edge = clamp(e / 18, 0, 1);
      const shade = 0.55 + 0.45 * edge;
      const wear = N.fbm(px * 0.004 + 9, py * 0.004, 2);
      r = r * shade + Math.max(0, wear) * 22; g = g * shade + Math.max(0, wear) * 18; b = b * shade + Math.max(0, wear) * 12;
      const i = (py * c.width + px) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = e < 1 ? 0 : 255;
    }
    x.putImageData(img, 0, 0);
    // filets dorés usés
    [16, 22].forEach(function (inset, k) {
      x.save();
      x.strokeStyle = 'rgba(214,170,92,' + (k ? 0.35 : 0.55) + ')'; x.lineWidth = k ? 0.8 : 1.4;
      x.setLineDash(k ? [] : [1000]);
      x.strokeRect(inset, inset, c.width - inset * 2, c.height - inset * 2);
      x.restore();
    });
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(0,0,0,' + (0.3 + N.rnd() * 0.5) + ')'; x.fillRect(N.rnd() * c.width, N.rnd() < 0.5 ? 15 + N.rnd() * 9 : c.height - 24 + N.rnd() * 9, 1 + N.rnd() * 3, 1); }
    x.globalCompositeOperation = 'source-over';
    // coutures
    x.strokeStyle = 'rgba(15,22,16,.8)'; x.lineWidth = 1.2; x.setLineDash([4, 3]);
    x.strokeRect(7, 7, c.width - 14, c.height - 14);
    x.strokeStyle = 'rgba(190,175,140,.25)'; x.lineWidth = 0.6; x.strokeRect(7.6, 7.4, c.width - 14, c.height - 14);
    x.setLineDash([]);
    return c;
  }

  /* ---------- papier vergé vieilli, bords frangés ---------- */
  function paper(w, h, o) {
    o = o || {};
    const c = canvas(w, h), x = c.getContext('2d');
    const W = c.width, H = c.height;
    const img = x.createImageData(W, H), d = img.data;
    const N = Noise(o.seed || 3), F = Noise((o.seed || 3) * 7 + 1);
    const sc = o.scale || 1;
    const base = o.tone || [233, 221, 193];
    const spots = [];
    for (let i = 0; i < (o.spots == null ? 5 : o.spots); i++) spots.push([N.rnd() * W, N.rnd() * H, (3 + N.rnd() * 10) * sc, 0.1 + N.rnd() * 0.15]);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const wx = px / sc, wy = py / sc;
      const e = Math.min(px, py, W - px, H - py) / sc;
      const blot = N.fbm(wx * 0.006, wy * 0.006, 4);
      const fib = F.n2(wx * 0.35, wy * 0.05) * 0.6 + F.n2(wx * 0.06, wy * 0.5) * 0.4;
      const laid = Math.sin(wy * 1.6) * 0.5 + 0.5;
      let r = base[0] - Math.max(0, blot) * 34 + fib * 6 - laid * 1.5;
      let g = base[1] - Math.max(0, blot) * 36 + fib * 6 - laid * 1.5;
      let b = base[2] - Math.max(0, blot) * 40 + fib * 5 - laid * 1.5;
      // bords bruns
      const edgeN = N.n2(wx * 0.05, wy * 0.05);
      const burn = Math.exp(-(e + edgeN * 8) / (o.edge || 16));
      r -= burn * 70; g -= burn * 82; b -= burn * 86;
      for (let s = 0; s < spots.length; s++) {
        const sp = spots[s], dx = px - sp[0], dy = py - sp[1], dd = dx * dx + dy * dy, rr = sp[2] * sp[2];
        if (dd < rr * 4) { const f = Math.exp(-dd / rr) * sp[3]; r -= f * 60; g -= f * 75; b -= f * 90; }
      }
      // frange irrégulière du papier fait main
      const fr = N.n2(wx * 0.35 + 50, wy * 0.35) * 2.2 + N.n2(wx * 0.08, wy * 0.08) * 2;
      const alpha = clamp((e - 1.2 - fr * (o.deckle == null ? 1 : o.deckle)) / 1.3, 0, 1);
      const i = (py * W + px) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = alpha * 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  /* ---------- plume d'oie, barbe par barbe ---------- */
  function quill(L, dpr) {
    const k = dpr || 2;
    const pad = 30;
    const Wd = L * 0.42 + pad * 2, Ht = L + pad * 2;
    const c = canvas(Wd * k, Ht * k), x = c.getContext('2d');
    x.scale(k, k);
    const N = Noise(11);
    const nx = Wd * 0.5, ny = L + pad;              // bec
    const tipx = nx + L * 0.05, tipy = pad;
    const cx = nx + L * 0.08, cy = ny - L * 0.55;
    const P = function (t) { const u = 1 - t; return [u * u * nx + 2 * u * t * cx + t * t * tipx, u * u * ny + 2 * u * t * cy + t * t * tipy]; };
    const T = function (t) { const u = 1 - t; const dx = 2 * u * (cx - nx) + 2 * t * (tipx - cx), dy = 2 * u * (cy - ny) + 2 * t * (tipy - cy); const l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
    // duvet à la base
    x.lineCap = 'round';
    for (let i = 0; i < 160; i++) {
      const t = 0.13 + N.rnd() * 0.12;
      const p = P(t), side = N.rnd() < 0.5 ? -1 : 1;
      const len = (8 + N.rnd() * 18) * (L / 300);
      x.strokeStyle = 'rgba(240,234,222,' + (0.25 + N.rnd() * 0.3) + ')'; x.lineWidth = 0.5;
      x.beginPath(); x.moveTo(p[0], p[1]);
      x.bezierCurveTo(p[0] + side * len * 0.3, p[1] - len * 0.2 + (N.rnd() - 0.5) * 8, p[0] + side * len * 0.8 + (N.rnd() - 0.5) * 10, p[1] - len * 0.3, p[0] + side * len, p[1] - len * 0.5 + (N.rnd() - 0.5) * 10);
      x.stroke();
    }
    // vexille : barbes asymétriques avec quelques déchirures
    [-1, 1].forEach(function (side) {
      const maxW = (side < 0 ? 0.2 : 0.1) * L;
      let split = 0;
      for (let t = 0.22; t < 0.995; t += 0.0021) {
        if (N.rnd() < 0.012) split = 4 + Math.floor(N.rnd() * 6);
        const prof = Math.sin(clamp((t - 0.2) / 0.8, 0, 1) * Math.PI * 0.92) * (t < 0.3 ? (t - 0.22) / 0.08 : 1);
        const len = maxW * Math.pow(prof, 0.7) * (0.92 + N.rnd() * 0.08) + 2;
        const p = P(t), tg = T(t);
        const nrm = [-tg[1] * side, tg[0] * side];
        const ang = (side < 0 ? 0.62 : 0.5) + (split ? 0.12 : 0) + (N.rnd() - 0.5) * 0.04;
        const dir = [nrm[0] * Math.cos(ang) + tg[0] * Math.sin(ang), nrm[1] * Math.cos(ang) + tg[1] * Math.sin(ang)];
        const ex = p[0] + dir[0] * len, ey = p[1] + dir[1] * len;
        const mx = p[0] + dir[0] * len * 0.5 + tg[0] * len * 0.12, my = p[1] + dir[1] * len * 0.5 + tg[1] * len * 0.12;
        const shade = side < 0 ? 0 : -14;
        const grey = 236 + shade - t * 18 + (N.rnd() - 0.5) * 14;
        x.strokeStyle = 'rgba(' + (grey | 0) + ',' + ((grey - 6) | 0) + ',' + ((grey - 18) | 0) + ',' + (0.55 + N.rnd() * 0.35) + ')';
        x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(p[0], p[1]); x.quadraticCurveTo(mx, my, ex, ey); x.stroke();
        if (split) split--;
      }
    });
    // ombre douce sur la moitié du vexille
    x.globalCompositeOperation = 'source-atop';
    const gr = x.createLinearGradient(nx - L * 0.2, 0, nx + L * 0.15, 0);
    gr.addColorStop(0, 'rgba(60,45,30,.28)'); gr.addColorStop(0.55, 'rgba(60,45,30,0)'); gr.addColorStop(1, 'rgba(40,30,20,.18)');
    x.fillStyle = gr; x.fillRect(0, 0, Wd, Ht);
    x.globalCompositeOperation = 'source-over';
    // rachis
    for (let i = 0; i < 2; i++) {
      x.beginPath();
      for (let t = 0.06; t <= 1.0; t += 0.01) { const p = P(t); if (t === 0.06) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]); }
      x.strokeStyle = i ? 'rgba(255,252,240,.9)' : 'rgba(150,130,100,.8)';
      x.lineWidth = i ? 1.2 : 2.6; x.stroke();
    }
    // calamus translucide et bec taillé taché d'encre
    const p0 = P(0), p1 = P(0.14);
    const cg = x.createLinearGradient(p0[0] - 4, 0, p0[0] + 4, 0);
    cg.addColorStop(0, 'rgba(170,140,90,.9)'); cg.addColorStop(0.5, 'rgba(245,230,200,.9)'); cg.addColorStop(1, 'rgba(150,120,80,.9)');
    x.strokeStyle = cg; x.lineWidth = 5; x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.stroke();
    x.strokeStyle = '#0c0a10'; x.lineWidth = 4.2;
    x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p0[0] + (p1[0] - p0[0]) * 0.18, p0[1] + (p1[1] - p0[1]) * 0.18); x.stroke();
    x.fillStyle = '#0c0a10'; x.beginPath(); x.moveTo(p0[0] - 2.3, p0[1] - 4); x.lineTo(p0[0], p0[1] + 5); x.lineTo(p0[0] + 2.3, p0[1] - 4); x.fill();
    return { img: c, k: k, nibX: nx, nibY: ny, w: Wd, h: Ht };
  }

  /* ---------- ombre floue d'un sprite (compatible Safari) ---------- */
  function shadowOf(src, blur) {
    const pad = Math.ceil(blur * 2);
    const c = canvas(src.width + pad * 2, src.height + pad * 2), x = c.getContext('2d');
    const tmp = canvas(src.width, src.height), tx = tmp.getContext('2d');
    tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#000'; tx.fillRect(0, 0, tmp.width, tmp.height);
    const steps = 12;
    x.globalAlpha = 1 / steps * 1.6;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2, r = blur * (0.4 + 0.6 * ((i % 3) / 2));
      x.drawImage(tmp, pad + Math.cos(a) * r, pad + Math.sin(a) * r);
    }
    return { img: c, pad: pad };
  }

  /* ---------- encrier en cristal taillé, couvercle en laiton ---------- */
  function inkwell(D, dpr) {
    const k = dpr || 2, pad = 10;
    const c = canvas((D * 1.45 + pad * 2) * k, (D * 1.3 + pad * 2) * k), x = c.getContext('2d');
    x.scale(k, k);
    const cx = pad + D * 0.55, cy = pad + D * 0.72, s = D * 0.46, hgt = D * 0.2;
    // couvercle ouvert, posé à gauche
    const lx = cx - s * 1.05, ly = cy - s * 0.95;
    const lg = x.createRadialGradient(lx - 6, ly - 6, 2, lx, ly, s * 0.42);
    lg.addColorStop(0, '#f6dd9c'); lg.addColorStop(0.45, '#b88a3c'); lg.addColorStop(1, '#5a3d14');
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(lx + 4, ly + 5, s * 0.42, s * 0.42, 0, 0, 7); x.fill();
    x.fillStyle = lg; x.beginPath(); x.arc(lx, ly, s * 0.4, 0, 7); x.fill();
    x.strokeStyle = 'rgba(60,40,10,.6)'; x.lineWidth = 1;
    [0.3, 0.22, 0.1].forEach(function (r) { x.beginPath(); x.arc(lx, ly, s * r, 0, 7); x.stroke(); });
    x.fillStyle = '#7a5520'; x.fillRect(lx + s * 0.32, ly + s * 0.15, s * 0.3, s * 0.12);
    // flanc du bloc de verre (projection oblique : la face avant est visible)
    function rr(px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
    const side = x.createLinearGradient(0, cy + s - hgt, 0, cy + s + hgt);
    side.addColorStop(0, 'rgba(30,48,46,.95)'); side.addColorStop(0.5, 'rgba(70,96,90,.85)'); side.addColorStop(1, 'rgba(18,28,28,.95)');
    x.fillStyle = side; rr(cx - s, cy - s + hgt, s * 2, s * 2, s * 0.22); x.fill();
    // dessus du bloc
    const top = x.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
    top.addColorStop(0, 'rgba(120,150,145,.92)'); top.addColorStop(0.35, 'rgba(40,62,60,.95)'); top.addColorStop(1, 'rgba(14,24,24,.97)');
    x.fillStyle = top; rr(cx - s, cy - s, s * 2, s * 2, s * 0.22); x.fill();
    // facettes biseautées
    const b = s * 0.26;
    const facets = [
      [[cx - s, cy - s], [cx + s, cy - s], [cx + s - b, cy - s + b], [cx - s + b, cy - s + b], 'rgba(255,255,255,.22)'],
      [[cx + s, cy - s], [cx + s, cy + s], [cx + s - b, cy + s - b], [cx + s - b, cy - s + b], 'rgba(255,240,210,.16)'],
      [[cx + s, cy + s], [cx - s, cy + s], [cx - s + b, cy + s - b], [cx + s - b, cy + s - b], 'rgba(0,0,0,.25)'],
      [[cx - s, cy + s], [cx - s, cy - s], [cx - s + b, cy - s + b], [cx - s + b, cy + s - b], 'rgba(0,0,0,.12)']
    ];
    facets.forEach(function (f) { x.fillStyle = f[4]; x.beginPath(); x.moveTo(f[0][0], f[0][1]); for (let i = 1; i < 4; i++) x.lineTo(f[i][0], f[i][1]); x.closePath(); x.fill(); });
    // encre vue à travers le verre
    const ink = x.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 0.75);
    ink.addColorStop(0, 'rgba(5,5,12,.95)'); ink.addColorStop(0.7, 'rgba(10,14,24,.6)'); ink.addColorStop(1, 'rgba(10,14,24,0)');
    x.fillStyle = ink; x.beginPath(); x.arc(cx, cy, s * 0.78, 0, 7); x.fill();
    // reflets du cristal
    x.strokeStyle = 'rgba(255,250,235,.35)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(cx - s + 6, cy - s + 3); x.lineTo(cx + s - 10, cy - s + 3); x.stroke();
    x.strokeStyle = 'rgba(255,250,235,.12)'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(cx - s * 0.6, cy + s * 0.7); x.lineTo(cx + s * 0.4, cy - s * 0.8); x.stroke();
    // col en laiton
    const ring = x.createLinearGradient(cx - s * 0.4, cy - s * 0.4, cx + s * 0.4, cy + s * 0.4);
    ring.addColorStop(0, '#fbe3a2'); ring.addColorStop(0.4, '#b5873a'); ring.addColorStop(0.7, '#6d4c18'); ring.addColorStop(1, '#d6aa5e');
    x.strokeStyle = ring; x.lineWidth = s * 0.13; x.beginPath(); x.arc(cx, cy, s * 0.36, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(40,25,5,.6)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, s * 0.29, 0, 7); x.stroke();
    // surface de l'encre
    const surf = x.createRadialGradient(cx + s * 0.1, cy - s * 0.1, 1, cx, cy, s * 0.29);
    surf.addColorStop(0, '#1d1b2c'); surf.addColorStop(0.6, '#07060c'); surf.addColorStop(1, '#020205');
    x.fillStyle = surf; x.beginPath(); x.arc(cx, cy, s * 0.29, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,210,150,.5)'; x.beginPath(); x.ellipse(cx + s * 0.12, cy - s * 0.12, s * 0.05, s * 0.025, -0.6, 0, 7); x.fill();
    return { img: c, k: k, cx: cx, cy: cy, s: s };
  }

  /* ---------- bougeoir en laiton (projection oblique) ---------- */
  function candleBase(R, dpr) {
    const k = dpr || 2;
    const Wd = R * 2.6, Ht = R * 2.4;
    const c = canvas(Wd * k, Ht * k), x = c.getContext('2d');
    x.scale(k, k);
    const cx = R * 1.15, cy = R * 1.25;
    const N = Noise(5);
    // anneau de préhension
    x.lineWidth = R * 0.12;
    const hg = x.createLinearGradient(cx + R * 0.8, cy - R * 0.3, cx + R * 1.35, cy + R * 0.3);
    hg.addColorStop(0, '#6a4815'); hg.addColorStop(0.5, '#e7c47a'); hg.addColorStop(1, '#5c3e12');
    x.strokeStyle = hg; x.beginPath(); x.ellipse(cx + R * 1.06, cy + R * 0.05, R * 0.24, R * 0.2, 0, 0, 7); x.stroke();
    // coupelle
    const dish = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    dish.addColorStop(0, '#f7dfa0'); dish.addColorStop(0.35, '#c39443'); dish.addColorStop(0.75, '#7d5719'); dish.addColorStop(1, '#4a320c');
    x.fillStyle = dish; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,230,170,.35)'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, R * 0.98, Math.PI * 1.05, Math.PI * 1.75); x.stroke();
    const inner = x.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 0.82);
    inner.addColorStop(0, 'rgba(60,40,10,0)'); inner.addColorStop(0.8, 'rgba(60,40,10,.25)'); inner.addColorStop(1, 'rgba(255,230,170,.18)');
    x.fillStyle = inner; x.beginPath(); x.arc(cx, cy, R * 0.82, 0, 7); x.fill();
    // coulures de cire dans la coupelle
    for (let i = 0; i < 6; i++) {
      const a = N.rnd() * 7, dist = R * (0.38 + N.rnd() * 0.25);
      const bx = cx + Math.cos(a) * dist, by = cy + Math.sin(a) * dist, br = R * (0.06 + N.rnd() * 0.08);
      const wg = x.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br);
      wg.addColorStop(0, '#fbf3df'); wg.addColorStop(1, '#d9c9a2');
      x.fillStyle = wg; x.beginPath(); x.ellipse(bx, by, br * 1.3, br, a, 0, 7); x.fill();
    }
    return { img: c, k: k, cx: cx, cy: cy };
  }

  /** Fût de bougie en projection oblique (dessiné chaque image : la cire peut fondre). */
  function drawCandle(x, cx, cy, r, h, lit) {
    const topY = cy - h;
    // ombre portée du fût sur la coupelle
    x.fillStyle = 'rgba(40,25,5,.35)'; x.beginPath(); x.ellipse(cx + r * 0.5, cy + r * 0.3, r * 1.15, r * 0.9, 0, 0, 7); x.fill();
    const body = x.createLinearGradient(cx - r, 0, cx + r, 0);
    body.addColorStop(0, '#b9a982'); body.addColorStop(0.35, '#f3ead3'); body.addColorStop(0.7, '#fffaf0'); body.addColorStop(1, '#cbbd97');
    x.fillStyle = body;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI); x.lineTo(cx - r, topY); x.arc(cx, topY, r, Math.PI, 0, true); x.closePath(); x.fill();
    // larmes de cire sur le côté
    x.fillStyle = 'rgba(255,250,235,.85)';
    [[0.55, 0.42], [-0.35, 0.28], [0.1, 0.6]].forEach(function (dd) {
      const dx = cx + dd[0] * r, len = h * dd[1];
      x.beginPath(); x.moveTo(dx - r * 0.12, topY); x.quadraticCurveTo(dx - r * 0.14, topY + len * 0.7, dx, topY + len);
      x.quadraticCurveTo(dx + r * 0.14, topY + len * 0.7, dx + r * 0.12, topY); x.fill();
    });
    // sommet : cuvette de cire fondue
    const tg = x.createRadialGradient(cx, topY, 0, cx, topY, r);
    tg.addColorStop(0, lit ? '#fff3cf' : '#efe5cc'); tg.addColorStop(0.65, lit ? '#f7e7bd' : '#e8dcc0'); tg.addColorStop(1, '#fffaf0');
    x.fillStyle = tg; x.beginPath(); x.arc(cx, topY, r, 0, 7); x.fill();
    x.strokeStyle = 'rgba(150,130,90,.35)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, topY, r * 0.7, 0, 7); x.stroke();
    // mèche
    x.strokeStyle = '#1a120c'; x.lineWidth = 2.2; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx, topY); x.quadraticCurveTo(cx + 2, topY - r * 0.35, cx + r * 0.12, topY - r * 0.55); x.stroke();
    return { wickX: cx + r * 0.12, wickY: topY - r * 0.55 };
  }

  /* ---------- dé à 20 faces en résine ---------- */
  function d20(R, dpr, top, seed) {
    top = top || 20;
    const k = dpr || 2;
    const c = canvas(R * 2.4 * k, R * 2.4 * k), x = c.getContext('2d');
    x.scale(k, k);
    const cx = R * 1.2, cy = R * 1.2;
    const hex = [];
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; hex.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
    const tri = [];
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; tri.push([cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52]); }
    const faces = [];
    faces.push([tri[0], tri[1], tri[2], 0]);
    for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3];
      faces.push([a, b, hex[(2 * i + 1) % 6], 1 + i]);
      faces.push([a, hex[(2 * i) % 6], hex[(2 * i + 1) % 6], 4 + i]);
      faces.push([b, hex[(2 * i + 1) % 6], hex[(2 * i + 2) % 6], 7 + i]);
    }
    const shades = [1, 0.75, 0.62, 0.48, 0.9, 0.55, 0.4, 0.85, 0.5, 0.38];
    faces.forEach(function (f) {
      const l = shades[f[3]];
      x.fillStyle = 'rgb(' + (120 * l + 20) + ',' + (18 * l + 6) + ',' + (22 * l + 8) + ')';
      x.beginPath(); x.moveTo(f[0][0], f[0][1]); x.lineTo(f[1][0], f[1][1]); x.lineTo(f[2][0], f[2][1]); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,200,190,.12)'; x.lineWidth = 0.8; x.stroke();
    });
    x.fillStyle = 'rgba(255,255,255,.28)'; x.beginPath(); x.ellipse(cx - R * 0.15, cy - R * 0.25, R * 0.16, R * 0.06, -0.5, 0, 7); x.fill();
    x.fillStyle = '#e9cf8f'; x.font = '700 ' + (R * 0.38) + 'px "IM Fell English", Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(top), cx, cy + R * 0.04);
    if (top === 6 || top === 9) { x.fillRect(cx - R * 0.12, cy + R * 0.2, R * 0.24, R * 0.035); }
    // trois faces voisines, numéros différents du dessus
    const N = Noise(seed || top * 7 + 3), others = [];
    while (others.length < 3) { const v = 1 + Math.floor(N.rnd() * 20); if (v !== top && others.indexOf(v) < 0) others.push(v); }
    x.font = '700 ' + (R * 0.2) + 'px Georgia, serif'; x.globalAlpha = 0.55;
    [[String(others[0]), 1], [String(others[1]), 2], [String(others[2]), 3]].forEach(function (n) {
      const f = faces[n[1] * 3 - 2]; const mx = (f[0][0] + f[1][0] + f[2][0]) / 3, my = (f[0][1] + f[1][1] + f[2][1]) / 3;
      x.fillText(n[0], mx, my);
    });
    x.globalAlpha = 1;
    return { img: c, k: k };
  }

  /* ---------- cachet de cire ---------- */
  function blobPath(x, cx, cy, r, seed, amp) {
    const N = Noise(seed || 9);
    x.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * Math.PI * 2;
      const rr = r * (1 + (N.n2(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6) * (amp || 0.16)));
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (!i) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
  }

  function drawSeal(x, cx, cy, r, o) {
    o = o || {};
    const spread = o.spread == null ? 1 : o.spread;
    x.save();
    // galette de cire
    blobPath(x, cx, cy, r * (0.55 + 0.45 * spread), o.seed || 9, 0.18);
    const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05);
    g.addColorStop(0, '#d0453a'); g.addColorStop(0.45, '#8e1d18'); g.addColorStop(1, '#4b0b09');
    x.fillStyle = g; x.fill();
    if (o.imprint) {
      const ir = r * 0.68;
      // cuvette de l'empreinte
      const ig = x.createRadialGradient(cx + ir * 0.2, cy + ir * 0.25, ir * 0.2, cx, cy, ir);
      ig.addColorStop(0, '#7e1814'); ig.addColorStop(0.85, '#6b130f'); ig.addColorStop(1, '#3c0806');
      x.fillStyle = ig; x.beginPath(); x.arc(cx, cy, ir, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,150,130,.35)'; x.lineWidth = r * 0.05; x.beginPath(); x.arc(cx, cy, ir, Math.PI * 0.15, Math.PI * 1.05); x.stroke();
      x.strokeStyle = 'rgba(30,0,0,.55)'; x.beginPath(); x.arc(cx, cy, ir, Math.PI * 1.15, Math.PI * 2.05); x.stroke();
      x.strokeStyle = 'rgba(40,0,0,.4)'; x.lineWidth = r * 0.025; x.setLineDash([r * 0.04, r * 0.05]); x.beginPath(); x.arc(cx, cy, ir * 0.86, 0, 7); x.stroke(); x.setLineDash([]);
      const txt = o.text || 'SiS2';
      x.font = (txt.length > 4 ? r * 0.34 : r * 0.44) + 'px "IM Fell English SC", "IM Fell English", Georgia, serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = 'rgba(255,170,150,.45)'; x.fillText(txt, cx - r * 0.025, cy + r * 0.03 - r * 0.025);
      x.fillStyle = 'rgba(25,0,0,.7)'; x.fillText(txt, cx + r * 0.03, cy + r * 0.03 + r * 0.03);
      x.fillStyle = '#8d1c17'; x.fillText(txt, cx, cy + r * 0.03);
    }
    // brillance
    x.globalCompositeOperation = 'lighter';
    x.fillStyle = 'rgba(255,180,160,.18)'; x.beginPath(); x.ellipse(cx - r * 0.42, cy - r * 0.45, r * 0.22, r * 0.09, -0.7, 0, 7); x.fill();
    x.restore();
  }

  /* ---------- enveloppe vue de dos ----------
   * Dessinée directement dans x, coin haut-gauche en (0,0).
   * part : 'back' (dos + intérieur) ou 'front' (rabats ; une lettre glissée entre les deux est « dedans »).
   * flapFold : 0 = rabat du haut ouvert à plat, 1 = fermé. */
  function envelope(x, w, h, tex, part, flapFold) {
    const ff = flapFold == null ? 1 : flapFold;
    if (part === 'back') {
      x.drawImage(tex, 0, 0, w, h);
      x.fillStyle = 'rgba(80,55,25,.16)'; x.fillRect(0, 0, w, h);
      if (ff < 0.5) { x.fillStyle = 'rgba(40,25,10,.4)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w / 2, h * 0.55); x.closePath(); x.fill(); }
      // rabat ouvert, posé à plat au-dessus de l'enveloppe
      if (ff < 0.5) drawTopFlap(x, w, h, tex, ff);
      return;
    }
    function flap(pts, shade) {
      x.save(); x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.closePath();
      x.clip(); x.drawImage(tex, 0, 0, w, h); x.fillStyle = shade; x.fillRect(0, 0, w, h); x.restore();
      x.strokeStyle = 'rgba(70,45,20,.3)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.stroke();
    }
    flap([[0, 0], [w * 0.47, h * 0.56], [0, h]], 'rgba(90,60,30,.08)');
    flap([[w, 0], [w * 0.53, h * 0.56], [w, h]], 'rgba(90,60,30,.15)');
    flap([[0, h], [w * 0.5, h * 0.42], [w, h]], 'rgba(255,240,210,.04)');
    if (ff >= 0.5) drawTopFlap(x, w, h, tex, ff);
  }
  function drawTopFlap(x, w, h, tex, ff) {
    const proj = Math.cos((1 - ff) * Math.PI);           // 1 fermé, -1 ouvert
    const fh = h * 0.6 * proj;
    x.save(); x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w / 2, fh); x.closePath(); x.clip();
    x.drawImage(tex, 0, Math.min(0, fh), w, Math.abs(fh) + 1);
    x.fillStyle = proj > 0 ? 'rgba(255,245,220,' + (0.05 * proj) + ')' : 'rgba(60,40,20,' + (0.22 * -proj) + ')';
    x.fillRect(0, Math.min(0, fh), w, Math.abs(fh) + 1);
    x.restore();
    x.strokeStyle = 'rgba(60,40,15,.35)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w / 2, fh); x.lineTo(w, 0); x.stroke();
    if (proj > 0.2) { x.fillStyle = 'rgba(40,25,10,' + (0.16 * proj) + ')'; x.beginPath(); x.moveTo(4, 2); x.lineTo(w / 2, fh + 5); x.lineTo(w - 4, 2); x.lineTo(w / 2, fh); x.closePath(); x.fill(); }
  }

  /* ---------- pigeon biset vu de dessus ---------- */
  function drawPigeon(x, p, S, shadowOnly) {
    // p : { x, y, a (cap), wing 0..1 (ouverture), flap (phase), head (avance de la tête), scale }
    const sc = (p.scale || 1) * S * 0.9;
    x.save();
    x.translate(p.x, p.y); x.rotate(p.a); x.scale(sc, sc);
    const sh = !!shadowOnly;
    const col = function (c) { return sh ? 'rgba(0,0,0,1)' : c; };
    const span = p.wing <= 0 ? 0 : p.wing * (0.32 + 0.68 * (0.5 + 0.5 * Math.cos(p.flap || 0)));
    const sweep = p.wing * Math.sin(p.flap || 0) * 0.25;
    // queue en éventail
    const tailFan = 0.25 + p.wing * 0.35;
    x.save(); x.translate(0, 30);
    for (let i = -5; i <= 5; i++) {
      x.save(); x.rotate(i / 5 * tailFan);
      if (!sh) { const tgr = x.createLinearGradient(0, 0, 0, 40); tgr.addColorStop(0, '#8a93a0'); tgr.addColorStop(0.6, '#6f7884'); tgr.addColorStop(0.78, '#2c3036'); tgr.addColorStop(1, '#22262b'); x.fillStyle = tgr; }
      else x.fillStyle = col();
      x.beginPath(); x.ellipse(0, 22, 5.2, 21, 0, 0, 7); x.fill();
      if (!sh) { x.strokeStyle = 'rgba(30,30,35,.35)'; x.lineWidth = 0.5; x.beginPath(); x.moveTo(0, 2); x.lineTo(0, 42); x.stroke(); }
      x.restore();
    }
    x.restore();
    // ailes déployées
    if (span > 0.05) {
      [-1, 1].forEach(function (s) {
        x.save(); x.translate(s * 14, -8); x.rotate(s * sweep); x.scale(s * span, 1);
        // silhouette de l'aile : couvertures claires, rémiges sombres, bord de fuite festonné
        if (!sh) {
          const wg = x.createLinearGradient(0, 0, 128, 0);
          wg.addColorStop(0, '#b3bbc6'); wg.addColorStop(0.45, '#a9b1bd'); wg.addColorStop(0.62, '#858e9a'); wg.addColorStop(0.85, '#4d545e'); wg.addColorStop(1, '#2f343b');
          x.fillStyle = wg;
        } else x.fillStyle = col();
        x.beginPath();
        x.moveTo(0, -10);
        x.bezierCurveTo(28, -20, 60, -22, 84, -16);
        x.bezierCurveTo(104, -12, 120, -6, 130, 2);
        const tips = [[126, 8], [120, 14], [113, 19], [105, 23], [96, 26], [86, 28], [74, 30], [60, 31], [46, 32], [32, 31], [18, 30], [6, 28]];
        let px = 130, py = 2;
        tips.forEach(function (t) { x.quadraticCurveTo((px + t[0]) / 2 + 2, (py + t[1]) / 2 + 3, t[0], t[1]); px = t[0]; py = t[1]; });
        x.lineTo(0, 24); x.closePath(); x.fill();
        if (!sh) {
          x.strokeStyle = 'rgba(30,32,38,.35)'; x.lineWidth = 0.7;
          for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(78, -10 + i); x.lineTo(tips[i][0], tips[i][1]); x.stroke(); }
          for (let i = 7; i < tips.length; i++) { x.beginPath(); x.moveTo(tips[i][0] + 4, 8); x.lineTo(tips[i][0], tips[i][1]); x.stroke(); }
          x.strokeStyle = 'rgba(25,25,30,.8)'; x.lineCap = 'round';
          x.lineWidth = 3; x.beginPath(); x.moveTo(8, 13); x.quadraticCurveTo(26, 12, 42, 6); x.stroke();
          x.lineWidth = 2.6; x.beginPath(); x.moveTo(8, 20); x.quadraticCurveTo(28, 20, 46, 13); x.stroke();
          x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 0.5;
          for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(6 + i * 6, -12 - i * 0.5); x.lineTo(4 + i * 6, 8 - i * 0.6); x.stroke(); }
        }
        x.restore();
      });
    }
    // corps
    if (!sh) { const bg = x.createRadialGradient(-4, 0, 4, 0, 6, 34); bg.addColorStop(0, '#a6afbb'); bg.addColorStop(0.7, '#8a939f'); bg.addColorStop(1, '#6c7480'); x.fillStyle = bg; } else x.fillStyle = col();
    x.beginPath(); x.ellipse(0, 6, 19, 33, 0, 0, 7); x.fill();
    if (!sh) {
      x.fillStyle = 'rgba(200,208,218,.35)'; x.beginPath(); x.ellipse(0, 26, 12, 8, 0, 0, 7); x.fill();
      x.strokeStyle = 'rgba(40,45,55,.12)'; x.lineWidth = 0.6;
      for (let i = 0; i < 26; i++) { const yy = -18 + i * 1.8; x.beginPath(); x.arc(0, yy, 14, 0.35 * Math.PI, 0.65 * Math.PI); x.stroke(); }
    }
    // ailes repliées
    if (p.wing < 0.6) {
      const f = 1 - p.wing / 0.6;
      [-1, 1].forEach(function (s) {
        x.save(); x.globalAlpha = sh ? 1 : f; x.scale(s, 1);
        if (!sh) { const fg = x.createLinearGradient(0, -14, 0, 50); fg.addColorStop(0, '#aeb6c1'); fg.addColorStop(0.65, '#97a0ac'); fg.addColorStop(1, '#3a3f47'); x.fillStyle = fg; } else x.fillStyle = col();
        x.beginPath(); x.moveTo(4, -14); x.bezierCurveTo(24, -6, 22, 26, 6, 54); x.lineTo(1, 52); x.bezierCurveTo(8, 24, 6, 0, 2, -12); x.closePath(); x.fill();
        if (!sh) {
          x.strokeStyle = 'rgba(25,25,30,.75)'; x.lineWidth = 2.2; x.lineCap = 'round';
          x.beginPath(); x.moveTo(9, 5); x.quadraticCurveTo(15, 6, 19, 10); x.stroke();
          x.beginPath(); x.moveTo(9, 13); x.quadraticCurveTo(15, 15, 18, 19); x.stroke();
        }
        x.restore();
      });
    }
    // cou irisé et tête
    const hy = -30 - (p.head || 0);
    if (!sh) {
      const ng = x.createRadialGradient(0, -24, 2, 0, -24, 15);
      ng.addColorStop(0, '#6c5a8d'); ng.addColorStop(0.45, '#4f8a6e'); ng.addColorStop(0.8, '#5a6d78'); ng.addColorStop(1, 'rgba(120,130,145,0)');
      x.fillStyle = ng; x.beginPath(); x.ellipse(0, -22, 15, 12, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(160,255,200,.15)'; x.beginPath(); x.ellipse(-5, -25, 5, 3, -0.4, 0, 7); x.fill();
    }
    x.fillStyle = sh ? col() : '#7c8693';
    x.beginPath(); x.ellipse(0, hy, 9.5, 11, 0, 0, 7); x.fill();
    if (!sh) {
      x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.ellipse(-3, hy - 3, 4, 3, 0, 0, 7); x.fill();
      x.fillStyle = '#e8eae6'; x.beginPath(); x.ellipse(0, hy - 10, 2.6, 2.2, 0, 0, 7); x.fill();
      x.fillStyle = '#3a3330'; x.beginPath(); x.moveTo(-1.8, hy - 11); x.lineTo(0, hy - 19); x.lineTo(1.8, hy - 11); x.closePath(); x.fill();
      [-1, 1].forEach(function (s) { x.fillStyle = '#d9772c'; x.beginPath(); x.arc(s * 7.2, hy - 2, 1.7, 0, 7); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(s * 7.4, hy - 2, 0.8, 0, 7); x.fill(); });
    } else { x.beginPath(); x.moveTo(-2, hy - 10); x.lineTo(0, hy - 19); x.lineTo(2, hy - 10); x.fill(); }
    x.restore();
  }

  /** Petite plume de contour (tombée du pigeon). */
  function feather(len, seed) {
    const c = canvas(len * 0.7 * 2, len * 2), x = c.getContext('2d');
    x.scale(2, 2);
    const N = Noise(seed || 4);
    const cx = len * 0.35, top = 2, bot = len - 2;
    for (let t = 0.12; t < 1; t += 0.012) {
      const y = bot - (bot - top) * t;
      const w = len * 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (t < 0.3 ? 0.6 : 1);
      [-1, 1].forEach(function (s) {
        const fl = t < 0.3;
        x.strokeStyle = 'rgba(' + (fl ? 190 : 140 + N.rnd() * 30) + ',' + (fl ? 196 : 148 + N.rnd() * 30) + ',' + (fl ? 205 : 160 + N.rnd() * 30) + ',' + (fl ? 0.4 : 0.75) + ')';
        x.lineWidth = 0.5;
        x.beginPath(); x.moveTo(cx, y); x.quadraticCurveTo(cx + s * w * 0.5, y - 2, cx + s * w, y - len * 0.12 + (N.rnd() - 0.5) * (fl ? 4 : 1)); x.stroke();
      });
    }
    x.strokeStyle = 'rgba(220,224,230,.9)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(cx, bot + 1); x.lineTo(cx, top + 2); x.stroke();
    return { img: c, w: len * 0.7, h: len };
  }

  window.Art = {
    Noise: Noise, canvas: canvas, wood: wood, leather: leather, paper: paper, quill: quill, shadowOf: shadowOf,
    inkwell: inkwell, candleBase: candleBase, drawCandle: drawCandle, d20: d20, drawSeal: drawSeal, blobPath: blobPath,
    envelope: envelope, drawPigeon: drawPigeon, feather: feather, clamp: clamp, lerp: lerp
  };
})();
