// Просмотр квартала: векторный план 100 м и его растеризация в клетки 1 м (стены — по правилам walls.js).
import { DIRS, hexPts, hexNorm } from '../core/hex.js';
import { setSeed } from '../core/random.js';
import { CELL, DISTRICTS } from './modules.js';
import { town } from './town.js';
import { QR, buildQuarterPlan, inPoly } from './quarter.js';
import { S, buildMap, cellAt } from './walls.js';

const $ = id => document.getElementById(id), svg = $('svg'), prm = new URLSearchParams(location.search);
const seed = +prm.get('seed') || 1; town.R = +prm.get('R') || 4;
let Q = +prm.get('q') || 0, R = +prm.get('r') || 0, plan = null, map = null, reach = null;
let vb = [-62, -52, 124, 104]; // окно в метрах относительно центра квартала
const C = () => plan.center;

const STREET = '#d9d0c0', MAIN = '#c4ad84', ALLEY = '#e8e2d6', PLAZA = '#ece0c2', YARD = '#a9cf86', WALLC = '#d9d5cc', DOOR = '#c9a36b';
const floorOf = t => { const c = CELL[t].color; return c + '99'; }; // пол — цвет типа здания, полупрозрачный

function load() {
  setSeed(seed); reach = null;
  const t0 = performance.now(); plan = buildQuarterPlan(Q, R); const t1 = performance.now();
  if (!plan) { $('info').textContent = 'вне города'; svg.innerHTML = ''; return; }
  const c = C(); map = buildMap(plan.buildings, [c[0] - 60, c[1] - 52, c[0] + 60, c[1] + 52], $('open').checked, (x, y) => hexNorm(x - c[0], y - c[1], QR) <= 1);
  const t2 = performance.now(), cells = [...map.cells.values()];
  classify();
  const D = DISTRICTS[plan.dist], kinds = {}; plan.buildings.forEach(b => kinds[CELL[b.type].name] = (kinds[CELL[b.type].name] || 0) + 1);
  $('title').textContent = `Квартал (${Q}, ${R}) — ${D.name}`;
  $('back').href = `town.html?seed=${seed}&R=${town.R}`;
  history.replaceState(null, '', `?seed=${seed}&R=${town.R}&q=${Q}&r=${R}`);
  $("info").textContent = `схема: ${plan.scheme.name}, поворот ${plan.scheme.rot}°${plan.scheme.mir ? ", отражена" : ""}
выходов улиц: ${plan.exits.length} (${plan.exits.map(x => x.kind === '=' ? 'главная' : 'улица').join(', ')})\n` +
    `улиц ${plan.streets.length}, переулков ${plan.alleys.length}\nзданий ${plan.buildings.length}: ${Object.entries(kinds).map(([k, v]) => k + ' ' + v).join(', ')}\n` +
    `клеток 1 м: ${cells.length}, из них стены ${cells.filter(c => c.wall).length}, двери ${cells.filter(c => c.door).length}\n` +
    `план ${(t1 - t0).toFixed(0)} мс, клетки ${(t2 - t1).toFixed(0)} мс`;
  draw();
}

// что лежит в клетке 1 м: стена, дверь, пол здания, улица, площадь, двор
function classify() {
  const segs = [...plan.streets, ...plan.alleys];
  const dSeg = (p, s) => { const dx = s.B[0] - s.A[0], dy = s.B[1] - s.A[1], t = Math.max(0, Math.min(1, ((p[0] - s.A[0]) * dx + (p[1] - s.A[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - s.A[0] - t * dx, p[1] - s.A[1] - t * dy); };
  for (const c of map.cells.values()) {
    const p = [c.x, c.y];
    if (c.wall) { c.fill = WALLC; continue; } if (c.door) { c.fill = DOOR; continue; }
    const b = plan.buildings.find(b => inPoly(p, b.poly)); if (b) { c.fill = floorOf(b.type); continue; }
    if (plan.plaza && inPoly(p, plan.plaza)) { c.fill = PLAZA; continue; }
    const s = segs.find(s => dSeg(p, s) <= s.w / 2); c.fill = s ? (s.kind === '=' ? MAIN : s.kind === ',' ? ALLEY : STREET) : YARD;
  }
}

const L = p => [(p[0] - C()[0]).toFixed(2), (p[1] - C()[1]).toFixed(2)];
const polyPts = poly => poly.map(p => L(p).join(',')).join(' ');
function draw() {
  if (!plan) return;
  svg.setAttribute('viewBox', vb.map(v => v.toFixed(2)).join(' '));
  let h = `<polygon points="${hexPts(0, 0, QR)}" fill="${YARD}"/>`;
  if ($('grid').checked) {
    for (const c of map.cells.values()) { const [x, y] = L([c.x, c.y]); h += `<polygon points="${hexPts(+x, +y, S * 1.01)}" fill="${reach ? (reach.has(c.q + ',' + c.r) ? '#ffe082' : c.fill) : c.fill}" stroke="#0001" stroke-width="0.03" data-k="${c.q},${c.r}"/>`; }
    // стены толщиной в полклетки, с проёмами дверей
    for (const w of map.walls) {
      let t = 0; const segs = [], P = s => L([w.A[0] + w.dir[0] * s, w.A[1] + w.dir[1] * s]);
      for (const [a, b] of [...w.doors].sort((a, b) => a[0] - b[0])) { segs.push([t, a]); t = b; } segs.push([t, w.len]);
      for (const [a, b] of segs) { const [x1, y1] = P(a), [x2, y2] = P(b); h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2b2118" stroke-width="0.5" pointer-events="none"/>`; }
      for (const p of [w.A, w.B]) { const [x, y] = L(p); h += `<circle cx="${x}" cy="${y}" r="0.25" fill="#2b2118" pointer-events="none"/>`; }
    }
  } else {
    // векторный план
    for (const s of [...plan.streets, ...plan.alleys]) { const [x1, y1] = L(s.A), [x2, y2] = L(s.B); h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s.kind === '=' ? MAIN : s.kind === ',' ? ALLEY : STREET}" stroke-width="${s.w}" stroke-linecap="square"/>`; }
    if (plan.plaza) h += `<polygon points="${polyPts(plan.plaza)}" fill="${PLAZA}"/>`;
    for (const b of plan.buildings) h += `<polygon points="${polyPts(b.poly)}" fill="${CELL[b.type].color}" stroke="#2b2118" stroke-width="${b.special ? 0.6 : 0.35}"/>`;
    for (const w of map.walls) for (const [a, b] of w.doors) { const m = (a + b) / 2, [x, y] = L([w.A[0] + w.dir[0] * m, w.A[1] + w.dir[1] * m]); h += `<circle cx="${x}" cy="${y}" r="0.55" fill="${DOOR}" stroke="#2b2118" stroke-width="0.12"/>`; }
  }
  h += `<polygon points="${hexPts(0, 0, QR)}" fill="none" stroke="#0007" stroke-width="0.4" stroke-dasharray="2 1.5" pointer-events="none"/>`;
  for (const x of plan.exits) { const [ex, ey] = L(x.p); h += `<circle cx="${ex}" cy="${ey}" r="1.2" fill="none" stroke="#e53935" stroke-width="0.4" pointer-events="none"/>`; }
  svg.innerHTML = h;
}

// ---- управление ----
const toMap = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
svg.addEventListener('wheel', ev => {
  ev.preventDefault(); const p = toMap(ev), f = Math.min(1.6, Math.max(0.08, vb[2] * Math.exp(ev.deltaY * 0.0015) / 124)) * 124 / vb[2];
  vb = [p.x + (vb[0] - p.x) * f, p.y + (vb[1] - p.y) * f, vb[2] * f, vb[3] * f]; draw();
}, { passive: false });
let drag = null;
svg.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, vb: [...vb], moved: false }; svg.setPointerCapture(ev.pointerId); });
svg.addEventListener('pointermove', ev => {
  if (!drag) return; const r = svg.getBoundingClientRect(), dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (drag.moved) { vb[0] = drag.vb[0] - dx / r.width * vb[2]; vb[1] = drag.vb[1] - dy / r.height * vb[3]; draw(); }
});
svg.addEventListener('pointerup', ev => {
  if (drag && !drag.moved && $('grid').checked && map) { // клик — куда можно дойти
    const p = toMap(ev), [q, r] = cellAt(p.x + C()[0], p.y + C()[1]), c = map.cells.get(q + ',' + r);
    reach = c ? map.region(c) : null; draw();
  }
  drag = null;
});
document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => { const [a, d] = DIRS[+b.dataset.d]; Q += a; R += d; load(); }));
$('grid').addEventListener('change', () => { reach = null; draw(); });
$('open').addEventListener('change', load);
$('legend').innerHTML = [['Главная улица', MAIN], ['Улица', STREET], ['Переулок', ALLEY], ['Площадь', PLAZA], ['Двор / сад', YARD], ['Дверь', DOOR], ['Клетка-стена (1 м)', WALLC],
  ...['R', 'C', 'T', 'S', 'H', 'h', 'p'].map(t => [CELL[t].name, CELL[t].color])].map(([n, c]) => `<div class="lg"><span class="sw" style="background:${c}"></span>${n}</div>`).join('') +
  `<div class="lg"><span class="sw" style="border:2px solid #e53935;border-radius:50%"></span>выход улицы на грани</div>`;
load();
