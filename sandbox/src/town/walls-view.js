// Просмотр прототипа стен: дома под 0/30/60° и редактируемый дом; комнаты, рассечённые клетки, закрытые рёбра, достижимость.
import { DIRS, hexPts } from '../core/hex.js';
import { S, px, cellAt, buildingWalls, buildMap, wallOpts } from './walls.js';

const $ = id => document.getElementById(id), svg = $('svg');
const BOX = [-21, -12, 21, 16]; // область карты, м
let vb = [BOX[0], BOX[1], BOX[2] - BOX[0], BOX[3] - BOX[1]];
const setVB = () => svg.setAttribute('viewBox', vb.map(x => x.toFixed(3)).join(' ')); setVB();
const toMap = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
svg.addEventListener('wheel', ev => { // колесо — масштаб вокруг курсора
  ev.preventDefault(); const p = toMap(ev), f = Math.min(1.5, Math.max(0.15, vb[2] * Math.exp(ev.deltaY * 0.0015) / (BOX[2] - BOX[0]))) * (BOX[2] - BOX[0]) / vb[2];
  vb = [p.x + (vb[0] - p.x) * f, p.y + (vb[1] - p.y) * f, vb[2] * f, vb[3] * f]; setVB();
}, { passive: false });
const ROOM = ['#f3d9a4', '#cfe0f5', '#f5cfd8', '#d6efc7', '#e5d4f3', '#f8e3c4', '#cdeee8', '#efe0b5', '#dcd6f0', '#f6d1bd'];

const FIXED = [
  { k: 0, at: [-15, -8], u: [0, 8], v: [0, 12], cuts: [{ axis: 'u', at: 4, door: 0.5 }], doors: [{ wall: 0, at: 0.25 }] },
  { k: 1, at: [-4, -9], u: [0, 12], v: [0, 6], cuts: [{ axis: 'v', at: 3, door: 0.7 }], doors: [{ wall: 1, at: 0.5 }] },
  { k: 2, at: [-12, 4], u: [0, 9], v: [0, 9], doors: [{ wall: 2, at: 0.5 }] },
];
let reach = null;

function editable() {
  const k = +$('k').value, u = +$('du').value, v = +$('dv').value;
  return { k, at: [10, 2], u: [-Math.floor(u / 2), Math.ceil(u / 2)], v: [-Math.floor(v / 2), Math.ceil(v / 2)],
    cuts: $('cut').checked ? [{ axis: 'u', at: 0, door: 0.5 }] : [], doors: [{ wall: 0, at: 0.3 }] };
}
const edgeSeg = (c, j) => { const [a, b] = DIRS[j], [nx, ny] = px(c.q + a, c.r + b), g = Math.atan2(ny - c.y, nx - c.x);
  return [g - Math.PI / 6, g + Math.PI / 6].map(t => [c.x + S * Math.cos(t), c.y + S * Math.sin(t)]); };

function draw() {
  wallOpts.tie = $('tie').value;
  const B = [...FIXED, editable()], open = $('open').checked;
  const m = buildMap(B, BOX, open), shutMap = buildMap(B, BOX, false);
  // комнаты: связные области при закрытых дверях; самая большая — улица
  const room = new Map(); let n = 0; const rooms = [];
  for (const c of shutMap.cells.values()) { const k = c.q + ',' + c.r; if (room.has(k)) continue; const reg = shutMap.region(c); for (const x of reg) room.set(x, n); rooms.push(reg.size); n++; }
  const street = rooms.indexOf(Math.max(...rooms));
  let h = `<defs><pattern id="hatch" width="0.35" height="0.35" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.35" stroke="#0005" stroke-width="0.1"/></pattern></defs>`;
  for (const c of m.cells.values()) {
    const k = c.q + ',' + c.r, ri = room.get(k), fill = reach ? (reach.has(k) ? '#ffe082' : '#f2f2f2') : ri === street ? '#e9efe0' : ROOM[ri % ROOM.length];
    h += `<polygon points="${hexPts(c.x, c.y, S)}" fill="${fill}" stroke="#0002" stroke-width="0.03" data-k="${k}"/>`;
    if ($('showCut').checked && c.cut) h += `<polygon points="${hexPts(c.x, c.y, S)}" fill="url(#hatch)" pointer-events="none"/>`;
  }
  if ($('showLogic').checked) h += `<path d="${m.closed.map(([c, , j]) => { const [p, q] = edgeSeg(c, j); return `M${p[0].toFixed(3)},${p[1].toFixed(3)}L${q[0].toFixed(3)},${q[1].toFixed(3)}`; }).join('')}" stroke="#e53935" stroke-width="0.09" stroke-linecap="round" fill="none" pointer-events="none"/>`;
  // стены вектором, с проёмами дверей
  for (const w of m.walls) {
    let t = 0; const segs = [], doors = [...w.doors].sort((a, b) => a[0] - b[0]);
    for (const [a, b] of doors) { segs.push([t, a]); t = b; } segs.push([t, w.len]);
    const col = w.kind === 'вершина–вершина' ? '#2b2118' : '#7a3fb0', P = s => [w.A[0] + w.dir[0] * s, w.A[1] + w.dir[1] * s];
    for (const [a, b] of segs) { const [x1, y1] = P(a), [x2, y2] = P(b); h += `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${col}" stroke-width="${w.inner ? 0.12 : 0.2}" stroke-linecap="round" pointer-events="none"/>`; }
  }
  svg.innerHTML = h;
  // сводка по редактируемому дому
  const e = editable(), { size } = buildingWalls(e), cellsInside = (() => { let s = 0; for (const c of m.cells.values()) { const ri = room.get(c.q + ',' + c.r); if (ri !== street && Math.hypot(c.x - 10, c.y - 2) < 12) s++; } return s; })();
  $('dims').textContent = `${size[0].toFixed(2)} × ${size[1].toFixed(2)} м = ${(size[0] * size[1]).toFixed(1)} м²\n«честных» клеток ${(size[0] * size[1] / (Math.sqrt(3) / 2)).toFixed(1)}, внутри по правилу ${cellsInside}`;
  $('stats').textContent = `клеток ${m.cells.size}\nзакрытых рёбер ${m.closed.length}\nрассечённых клеток ${[...m.cells.values()].filter(c => c.cut).length}\nкомнат ${rooms.length - 1}`;
}

svg.addEventListener('click', ev => {
  const p = toMap(ev), [q, r] = cellAt(p.x, p.y), B = [...FIXED, editable()], m = buildMap(B, BOX, $('open').checked), c = m.cells.get(q + ',' + r);
  reach = c && !(reach && reach.has(q + ',' + r) && reach.size && reach.start === q + ',' + r) ? Object.assign(m.region(c), { start: q + ',' + r }) : null;
  draw();
});
for (const id of ['tie', 'open', 'showCut', 'showLogic', 'k', 'du', 'dv', 'cut']) $(id).addEventListener('input', () => { if (id !== 'showCut' && id !== 'showLogic') reach = null; draw(); });
draw();
