'use strict';
const http = require('http');
const animations = require('./animations');
const meta = animations.meta;
delete animations.meta;

const PORT = process.env.PORT || 8080;
const ESC = '\x1b[';
const clamp = (v, lo, hi, d) => {
  if (v === null || v === undefined || String(v).trim() === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

// ---- color palettes: value 0..1 -> 256-color index ----
const palettes = {
  fire: (v) => [232, 52, 88, 124, 160, 196, 202, 208, 214, 220, 226, 229, 231][Math.floor(v * 12.99)],
  matrix: (v) => [22, 28, 34, 40, 46, 82, 120, 157, 195, 231][Math.floor(v * 9.99)],
  ice: (v) => [17, 18, 19, 25, 31, 37, 44, 81, 117, 153, 195, 231][Math.floor(v * 11.99)],
  rainbow: (v) => [196, 202, 208, 214, 226, 118, 46, 49, 51, 33, 21, 93, 129, 201][Math.floor(v * 13.99)],
  mono: null,
};
const defaultColor = { donut: 'fire', plasma: 'rainbow', matrix: 'matrix', starfield: 'ice', fire: 'fire', life: 'matrix', waves: 'ice', clock: 'rainbow', tunnel: 'rainbow', propose: 'rainbow' };

function render(frame, w, h, palette) {
  let s = '';
  for (let y = 0; y < h; y++) {
    let last = -1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, ch = frame.chars[i];
      if (palette && ch !== ' ') {
        const c = palette(Math.max(0, Math.min(1, frame.vals[i])));
        if (c !== last) { s += `${ESC}38;5;${c}m`; last = c; }
      }
      s += ch;
    }
    if (palette) s += `${ESC}0m`;
    s += '\n';
  }
  return s;
}

function indexPage(host) {
  const rows = Object.keys(meta).map((k) => `  curl ${host}/${k.padEnd(10)} # ${meta[k]}`).join('\n');
  return `ascii-forge: procedurally generated ASCII animations, streamed over curl

${rows}

options (query string):
  ?fps=24            frames per second (1-60)
  ?w=80&h=24         size in columns/rows (defaults to 80x24, max 200x60)
  ?color=fire        fire | matrix | ice | rainbow | mono   (default depends on animation)
  ?speed=1.5         time multiplier (0.1-5)
  ?duration=10       stop after N seconds (default: run until you Ctrl+C)

examples:
  curl "${host}/donut?color=ice&fps=30"
  curl "${host}/clock?w=100&h=30"
  curl "${host}/list"
`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const name = url.pathname.replace(/^\/|\/$/g, '');
  const host = req.headers.host || `localhost:${PORT}`;
  if (name === '' || name === 'help') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(indexPage(host)); }
  if (name === 'list') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(meta, null, 2) + '\n'); }
  const anim = animations[name];
  if (!anim) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end(`no such animation: ${name}\ntry: curl ${host}/\n`); }

  const q = url.searchParams;
  const w = Math.floor(clamp(q.get('w'), 20, 200, 80));
  const h = Math.floor(clamp(q.get('h'), 8, 60, 24));
  const fps = clamp(q.get('fps'), 1, 60, 24);
  const speed = clamp(q.get('speed'), 0.1, 5, 1);
  const duration = clamp(q.get('duration'), 1, 3600, 0);
  const colorName = q.get('color') || defaultColor[name];
  const palette = palettes[colorName] === undefined ? palettes[defaultColor[name]] : palettes[colorName];

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  res.write(`${ESC}2J${ESC}?25l`);
  const state = {};
  const t0 = Date.now();
  const tick = () => {
    const t = ((Date.now() - t0) / 1000) * speed;
    res.write(`${ESC}H` + render(anim(t, w, h, state), w, h, palette));
    if (duration && (Date.now() - t0) / 1000 >= duration) done();
  };
  const timer = setInterval(tick, 1000 / fps);
  let ended = false;
  const done = () => { if (ended) return; ended = true; clearInterval(timer); try { res.end(`${ESC}0m${ESC}?25h\n`); } catch {} };
  req.on('close', () => { ended = true; clearInterval(timer); });
  tick();
});

server.listen(PORT, () => console.log(`ascii-forge listening on http://localhost:${PORT}`));
