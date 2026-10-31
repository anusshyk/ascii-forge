'use strict';
// Each animation: (t, w, h, state) => { chars: string[w*h], vals: number[w*h] (0..1, used for color) }
// t = seconds since stream start. state = per-client object for stateful animations.

const RAMP = ' .:-=+*#%@';
const ramp = (v) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1e-6))))];

const blank = (w, h) => ({ chars: new Array(w * h).fill(' '), vals: new Array(w * h).fill(0) });

// ---------- donut: classic spinning torus, with z-buffer ----------
function donut(t, w, h) {
  const out = blank(w, h);
  const zbuf = new Float32Array(w * h);
  const A = t * 1.1, B = t * 0.6;
  const cA = Math.cos(A), sA = Math.sin(A), cB = Math.cos(B), sB = Math.sin(B);
  const K2 = 6, K1 = Math.min(w * 0.55, h * 1.25);
  for (let th = 0; th < 6.283; th += 0.05) {
    const ct = Math.cos(th), st = Math.sin(th);
    for (let ph = 0; ph < 6.283; ph += 0.02) {
      const cp = Math.cos(ph), sp = Math.sin(ph);
      const cx = 2 + ct, cy = st;
      const x = cx * (cB * cp + sA * sB * sp) - cy * cA * sB;
      const y = cx * (sB * cp - sA * cB * sp) + cy * cA * cB;
      const z = K2 + cA * cx * sp + cy * sA;
      const ooz = 1 / z;
      const xp = Math.floor(w / 2 + K1 * ooz * x);
      const yp = Math.floor(h / 2 - K1 * ooz * y * 0.5);
      const L = cp * ct * sB - cA * ct * sp - sA * st + cB * (cA * st - ct * sA * sp);
      if (xp >= 0 && xp < w && yp >= 0 && yp < h && ooz > zbuf[xp + yp * w]) {
        zbuf[xp + yp * w] = ooz;
        const v = Math.max(0, (L + 1.41) / 2.82);
        out.chars[xp + yp * w] = ramp(0.15 + v * 0.85);
        out.vals[xp + yp * w] = v;
      }
    }
  }
  return out;
}

// ---------- plasma: summed sines ----------
function plasma(t, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w * 8, ny = y / h * 5;
      let v = Math.sin(nx + t) + Math.sin(ny * 1.6 + t * 1.3) +
        Math.sin((nx + ny + t) * 0.7) +
        Math.sin(Math.hypot(nx - 4 + Math.sin(t), ny - 2.5 + Math.cos(t * 0.8)) * 1.5);
      v = Math.max(0, Math.min(1, ((v + 4) / 8 - 0.2) / 0.6));
      out.chars[y * w + x] = ramp(v);
      out.vals[y * w + x] = v;
    }
  }
  return out;
}

// ---------- matrix: falling glyph rain ----------
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789:.=*+-<>';
function matrix(t, w, h, st) {
  if (!st.cols || st.cols.length !== w) {
    st.cols = Array.from({ length: w }, () => ({
      y: -Math.random() * h, speed: 4 + Math.random() * 14, len: 5 + Math.floor(Math.random() * (h * 0.8)),
    }));
    st.last = t;
  }
  const dt = t - st.last; st.last = t;
  const out = blank(w, h);
  st.cols.forEach((c, x) => {
    c.y += c.speed * dt;
    if (c.y - c.len > h) { c.y = -Math.random() * h * 0.5; c.speed = 4 + Math.random() * 14; c.len = 5 + Math.floor(Math.random() * (h * 0.8)); }
    for (let i = 0; i < c.len; i++) {
      const y = Math.floor(c.y) - i;
      if (y < 0 || y >= h) continue;
      const v = 1 - i / c.len;
      out.chars[y * w + x] = i === 0 ? '@' : GLYPHS[Math.floor((x * 7 + y * 13 + Math.floor(t * 8 + i)) % GLYPHS.length)];
      out.vals[y * w + x] = v;
    }
  });
  return out;
}

// ---------- starfield: warp-speed stars ----------
function starfield(t, w, h, st) {
  if (!st.stars) {
    st.stars = Array.from({ length: Math.floor(w * h / 12) }, () => ({
      x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(),
    }));
    st.last = t;
  }
  const dt = t - st.last; st.last = t;
  const out = blank(w, h);
  for (const s of st.stars) {
    s.z -= dt * 0.55;
    if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; }
    const px = Math.floor(w / 2 + (s.x / s.z) * w * 0.12);
    const py = Math.floor(h / 2 + (s.y / s.z) * h * 0.25);
    if (px < 0 || px >= w || py < 0 || py >= h) { s.z = 1; continue; }
    const v = 1 - s.z;
    out.chars[py * w + px] = v > 0.8 ? '@' : v > 0.55 ? '*' : v > 0.3 ? '+' : '.';
    out.vals[py * w + px] = v;
  }
  return out;
}

// ---------- fire: heat diffusion ----------
function fire(t, w, h, st) {
  if (!st.heat || st.heat.length !== w * h) st.heat = new Float32Array(w * h);
  const H = st.heat;
  for (let x = 0; x < w; x++) H[(h - 1) * w + x] = 0.6 + Math.random() * 0.4;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const a = H[(y + 1) * w + ((x - 1 + w) % w)], b = H[(y + 1) * w + x],
        c = H[(y + 1) * w + ((x + 1) % w)], d = H[Math.min(h - 1, y + 2) * w + x];
      H[y * w + x] = Math.max(0, (a + b + c + d) / 4 - 0.035 - Math.random() * 0.02);
    }
  }
  const out = blank(w, h);
  for (let i = 0; i < w * h; i++) { out.chars[i] = ramp(H[i]); out.vals[i] = H[i]; }
  return out;
}

// ---------- life: Conway's Game of Life that reseeds when stale ----------
function life(t, w, h, st) {
  if (!st.g || st.g.length !== w * h) { st.g = new Uint8Array(w * h).map(() => Math.random() < 0.28 ? 1 : 0); st.age = new Uint8Array(w * h); st.gen = 0; st.acc = 0; st.last = t; }
  st.acc += t - st.last; st.last = t;
  if (st.acc > 0.12) {
    st.acc = 0; st.gen++;
    const n = new Uint8Array(w * h);
    let alive = 0, changed = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) c += st.g[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      }
      const i = y * w + x, cur = st.g[i];
      n[i] = cur ? (c === 2 || c === 3 ? 1 : 0) : (c === 3 ? 1 : 0);
      st.age[i] = n[i] ? Math.min(255, st.age[i] + 1) : 0;
      alive += n[i]; if (n[i] !== cur) changed++;
    }
    st.g = n;
    if (alive < w * h * 0.02 || changed < 3 || st.gen > 400) { st.g = new Uint8Array(w * h).map(() => Math.random() < 0.28 ? 1 : 0); st.age.fill(0); st.gen = 0; }
  }
  const out = blank(w, h);
  for (let i = 0; i < w * h; i++) if (st.g[i]) {
    const a = Math.min(1, st.age[i] / 12);
    out.chars[i] = a > 0.7 ? '#' : a > 0.3 ? 'o' : '+';
    out.vals[i] = 0.3 + a * 0.7;
  }
  return out;
}

// ---------- waves: layered sine ocean with foam ----------
function waves(t, w, h) {
  const out = blank(w, h);
  for (let x = 0; x < w; x++) {
    const nx = x / w * Math.PI * 2;
    for (let layer = 0; layer < 4; layer++) {
      const base = h * (0.35 + layer * 0.17);
      const y = base + Math.sin(nx * (1.5 + layer * 0.6) + t * (1.2 + layer * 0.4) + layer) * h * 0.09
        + Math.sin(nx * 4 - t * 2) * h * 0.02;
      const yi = Math.floor(y);
      for (let yy = yi; yy < h; yy++) {
        if (yy < 0) continue;
        const depth = (yy - yi) / h;
        const i = yy * w + x;
        out.chars[i] = yy === yi ? '~' : depth < 0.1 ? '-' : depth < 0.25 ? '=' : '#';
        out.vals[i] = Math.max(0.05, 1 - layer * 0.22 - depth * 0.6);
      }
    }
  }
  return out;
}

// ---------- clock: live digital clock with a sweeping seconds bar ----------
const DIG = {
  '0': ['###', '# #', '# #', '# #', '###'], '1': ['  #', '  #', '  #', '  #', '  #'],
  '2': ['###', '  #', '###', '#  ', '###'], '3': ['###', '  #', '###', '  #', '###'],
  '4': ['# #', '# #', '###', '  #', '  #'], '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'], '7': ['###', '  #', '  #', '  #', '  #'],
  '8': ['###', '# #', '###', '# #', '###'], '9': ['###', '# #', '###', '  #', '###'],
  ':': [' ', '#', ' ', '#', ' '],
};
function clock(t, w, h, st) {
  const out = blank(w, h);
  const d = new Date();
  const s = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  const scale = Math.max(1, Math.min(Math.floor(w / 36), Math.floor(h / 8)));
  const glyphs = [...s].map((c) => DIG[c]);
  const totalW = glyphs.reduce((a, g) => a + g[0].length * scale + scale, 0) - scale;
  let ox = Math.floor((w - totalW) / 2), oy = Math.floor((h - 5 * scale) / 2);
  const pulse = 0.6 + 0.4 * Math.sin(t * 6.283);
  for (const g of glyphs) {
    for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') {
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const x = ox + c * scale + dx, y = oy + r * scale + dy;
        if (x >= 0 && x < w && y >= 0 && y < h) { out.chars[y * w + x] = '#'; out.vals[y * w + x] = 0.5 + 0.5 * pulse * (r / 5); }
      }
    }
    ox += g[0].length * scale + scale;
  }
  const frac = (d.getSeconds() + d.getMilliseconds() / 1000) / 60;
  const by = Math.min(h - 1, oy + 5 * scale + 2), bw = Math.floor(w * 0.6), bx = Math.floor((w - bw) / 2);
  for (let i = 0; i < bw; i++) {
    const on = i / bw <= frac;
    out.chars[by * w + bx + i] = on ? '=' : '.';
    out.vals[by * w + bx + i] = on ? i / bw : 0.1;
  }
  return out;
}

// ---------- tunnel: flying through a checkered tunnel ----------
function tunnel(t, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2) * 1.0;
    const r = Math.hypot(dx, dy) + 1e-4, a = Math.atan2(dy, dx);
    const u = a / Math.PI * 4 + t * 0.4, vv = 0.4 / r + t * 1.4;
    const chk = (Math.floor(u * 2) + Math.floor(vv * 2)) & 1;
    const v = Math.min(1, r * 1.1) * (chk ? 1 : 0.45);
    out.chars[y * w + x] = ramp(v);
    out.vals[y * w + x] = (vv * 0.1) % 1;
  }
  return out;
}

// ---------- propose: she asks, he says yes ----------
function propose(t, w, h) {
  const o = blank(w, h);
  const T = t % 15;
  const put = (x, y, str, v) => {
    for (let i = 0; i < str.length; i++) {
      const xx = Math.round(x) + i;
      if (str[i] !== ' ' && xx >= 0 && xx < w && y >= 0 && y < h) { o.chars[y * w + xx] = str[i]; o.vals[y * w + xx] = v; }
    }
  };
  const sprite = (x, y, rows, v) => rows.forEach((r, i) => put(x, y + i, r, v));
  const clamp01 = (a) => Math.max(0, Math.min(1, a));
  const ease = (a) => a * a * (3 - 2 * a);
  const cx = Math.floor(w / 2), gy = h - 5;
  for (let i = 0; i < 16; i++) {
    const x = (i * 37 + 11) % w, y = (i * 5) % Math.max(1, gy - 5);
    put(x, y, Math.sin(t * 2 + i) > 0 ? '*' : '.', 0.62);
  }
  put(0, gy + 4, '_'.repeat(w), 0.45);
  const p = ease(clamp01(T / 4));
  const xw = 2 + (cx - 10 - 2) * p, xm = (w - 8) + (cx + 5 - (w - 8)) * p;
  const step = Math.floor(T * 4) % 2, walking = T < 4;
  const legsW = walking && step ? ' | | ' : '  |  ', legsM = walking && step ? ' / \\ ' : '  |  ';
  const kneel = T >= 4.5 && T < 9.5;
  if (kneel) {
    sprite(xw, gy, [' ~O~  ', ' /|\\_o', '/___\\ ', '_/ \\_ '], 0.95);
    put(xw + 6, gy - 1, Math.floor(t * 4) % 2 ? '*' : '+', 0.3);
  } else {
    sprite(xw, gy, [' ~O~ ', ' /|\\ ', '/___\\', legsW], 0.95);
  }
  const up = T >= 6;
  const hop = T >= 8.5 ? (Math.floor(T * 5) % 2) : 0;
  sprite(xm, gy - hop, up ? ['\\ O /', ' \\|/ ', '  |  ', ' / \\ '] : ['  O  ', ' /|\\ ', '  |  ', legsM], 0.75);
  if (T >= 4.5 && T < 8.5) {
    const msg = 'Will you marry me?', n = Math.min(msg.length, Math.floor((T - 4.5) * 9));
    const bx = Math.max(0, Math.round(xw) - 2);
    put(bx, gy - 4, '.' + '-'.repeat(20) + '.', 0.3);
    put(bx, gy - 3, '| ' + msg.slice(0, n).padEnd(18) + ' |', 0.3);
    put(bx, gy - 2, "'--v" + '-'.repeat(17) + "'", 0.3);
  }
  if (T >= 6.5 && T < 8.5) put(xm + 1, gy - 1, Math.floor(T * 6) % 2 ? '!?' : '?!', 0.3);
  if (T >= 8.5) {
    put(xm - 1, gy - 4, '.------.', 0.3);
    put(xm - 1, gy - 3, '| YES! |', 0.3);
    put(xm - 1, gy - 2, "'--v---'", 0.3);
  }
  if (T >= 9) {
    for (let i = 0; i < 12; i++) {
      const r = ((T - 9) * 0.6 + i * 0.37) % 1;
      const y = Math.floor(gy - 1 - r * (gy - 1));
      const x = Math.round(cx - 2 + Math.sin(i * 1.7 + T * 2) * 14 + ((i % 3) - 1) * 3);
      put(x, y, '\u2665', 0.0);
    }
  }
  if (T >= 10) {
    for (let i = 0; i < 30; i++) {
      const fall = ((T - 10) * 0.5 + i * 0.173) % 1;
      put((i * 53 + 7) % w, Math.floor(fall * (gy + 3)), '*+.:'[i % 4], (i * 0.13) % 1);
    }
  }
  if (T >= 11) {
    const cap = 'SHE ASKED. HE SAID YES.';
    put(Math.floor((w - cap.length) / 2), 1, cap, 0.3);
  }
  return o;
}

module.exports = {
  propose, donut, plasma, matrix, starfield, fire, life, waves, clock, tunnel,
};
module.exports.meta = {
  donut: 'spinning 3D torus with z-buffer shading',
  plasma: 'classic demoscene plasma',
  matrix: 'falling glyph rain',
  starfield: 'warp-speed star flight',
  fire: 'heat-diffusion flames',
  life: "Conway's Game of Life (auto-reseeds)",
  waves: 'layered ocean waves',
  clock: 'live digital clock with seconds bar',
  tunnel: 'checkered tunnel flythrough',
  propose: 'she asks, he says yes (confetti and hearts)',
};
