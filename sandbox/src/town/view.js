// Просмотр города: SVG, масштаб колесом, сдвиг перетаскиванием, клик — сведения о квартале.
import { DIRS, K, toPx, hexPts, childRound, parentOf } from '../core/hex.js';
import { setSeed } from '../core/random.js';
import { CELL, DISTRICTS, MODULES, EDGE, isInterior } from './modules.js';
import { town, buildTown, districtOf } from './town.js';

const $ = id => document.getElementById(id), svg = $('svg');
let T = null, sel = null, view = { cx: 0, cy: 0, w: 160 };

// ребро клетки в сторону соседа j (для обводки зданий)
const edgeSeg = (x, y, j) => { const [dx, dy] = toPx(...DIRS[j]), a = Math.atan2(dy, dx), p = a - Math.PI / 6, q = a + Math.PI / 6; return [x + Math.cos(p), y + Math.sin(p), x + Math.cos(q), y + Math.sin(q)]; };

function cellsSvg(cells) {
  let h = '', lines = '';
  for (const c of cells.values()) {
    const [x, y] = toPx(c.q, c.r);
    h += `<polygon points="${hexPts(x, y, 1.02)}" fill="${CELL[c.t].color}"/>`;
    if (!c.b) continue;
    DIRS.forEach(([a, b], j) => { const n = cells.get(K(c.q + a, c.r + b)); if (!n || n.b !== c.b) { const s = edgeSeg(x, y, j); lines += `M${s[0].toFixed(2)},${s[1].toFixed(2)}L${s[2].toFixed(2)},${s[3].toFixed(2)}`; } });
  }
  return h + `<path d="${lines}" stroke="#2b2118" stroke-width="0.22" stroke-linecap="round" fill="none"/>`;
}

function draw() {
  const h = view.w * 0.75;
  svg.setAttribute('viewBox', `${view.cx - view.w / 2} ${view.cy - h / 2} ${view.w} ${h}`);
  let s = cellsSvg(T.cells);
  if ($('borders').checked || $('labels').checked) for (const q of T.quarters) {
    const [x, y] = toPx(q.Q, q.R, 10);
    if ($('borders').checked) s += `<polygon points="${hexPts(x, y, 10)}" fill="none" stroke="#0005" stroke-width="0.25" stroke-dasharray="1 1" pointer-events="none"/>`;
    if ($('labels').checked) s += `<text x="${x}" y="${y}" font-size="2.6" text-anchor="middle" dominant-baseline="middle" fill="#000" stroke="#fff" stroke-width="0.5" paint-order="stroke" pointer-events="none">${DISTRICTS[q.info.district].name}</text>`;
  }
  if (sel) { const [x, y] = toPx(sel.Q, sel.R, 10); s += `<polygon points="${hexPts(x, y, 10)}" fill="none" stroke="#e53935" stroke-width="0.6" pointer-events="none"/>`; }
  svg.innerHTML = s;
}

function rebuild() {
  setSeed(+$('seed').value || 1); town.R = +$('radius').value; $('radiusV').textContent = town.R;
  const t0 = performance.now(); T = buildTown(); const ms = performance.now() - t0, c = T.check;
  const ok = !c.seam && !c.cut;
  $('check').innerHTML = `<span class="${ok ? 'ok' : 'bad'}">кварталов ${c.quarters} · стыков с ошибкой ${c.seam} · оторванных улиц ${c.cut}</span> · доводок ${c.fixes} · тупиков ${c.deadEnds} · ${ms.toFixed(0)} мс`;
  sel = null; $('info').textContent = 'кликни по кварталу'; draw();
}

function showInfo(Q, R) {
  const q = T.quarters.find(x => x.Q === Q && x.R === R); sel = q || null; draw();
  if (!q) { $('info').textContent = 'вне города'; return; }
  const i = q.info, D = DISTRICTS[i.district];
  $('info').textContent = `Квартал (${Q}, ${R}) — ${D.name}\nвыходов улиц на гранях: ${i.ports}\n` +
    (i.module ? `модуль: ${i.module}\nповорот ${i.rotation}°${i.mirror ? ', отражён' : ''}, совпадение ${i.score}\nдоводок: ${i.fixes}, тупиков: ${i.deadEnds}` : 'застройка по шаблону района');
  const a = document.createElement('a'); a.href = `quarter.html?seed=${$('seed').value}&R=${town.R}&q=${Q}&r=${R}`; a.textContent = '\nОткрыть векторный план квартала →'; $('info').appendChild(a);
}

// ---- управление картой ----
const toWorld = ev => { const r = svg.getBoundingClientRect(), h = view.w * 0.75; return [view.cx + ((ev.clientX - r.left) / r.width - 0.5) * view.w, view.cy + ((ev.clientY - r.top) / r.height - 0.5) * h]; };
let drag = null;
svg.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, cx: view.cx, cy: view.cy, moved: false }; svg.setPointerCapture(ev.pointerId); });
svg.addEventListener('pointermove', ev => {
  if (!drag) return; const r = svg.getBoundingClientRect(), dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (drag.moved) { view.cx = drag.cx - dx / r.width * view.w; view.cy = drag.cy - dy / r.width * view.w; draw(); }
});
svg.addEventListener('pointerup', ev => {
  if (drag && !drag.moved) { const [x, y] = toWorld(ev), [q, r] = childRound(x, y), [Q, R] = parentOf(q, r); showInfo(Q, R); }
  drag = null;
});
svg.addEventListener('wheel', ev => {
  ev.preventDefault(); const [x, y] = toWorld(ev), k = Math.exp(ev.deltaY * 0.0015), w = Math.min(600, Math.max(15, view.w * k)), f = w / view.w;
  view.cx = x + (view.cx - x) * f; view.cy = y + (view.cy - y) * f; view.w = w; draw();
}, { passive: false });

// ---- боковая панель ----
function initSide() {
  $('districts').innerHTML = Object.values(DISTRICTS).map(d => `<div class="lg"><span class="sw" style="background:${d.color}"></span>${d.name}${d.modules ? ' — ручной модуль' : ' — шаблон'}</div>`).join('');
  $('legend').innerHTML = Object.entries(CELL).map(([k, c]) => `<div class="lg"><span class="sw" style="background:${c.color}"></span><code>${k}</code> ${c.name}</div>`).join('');
  $('library').innerHTML = MODULES.map(m => {
    const cells = new Map();
    for (const [k, t] of m.cells) { const [q, r] = k.split(',').map(Number); cells.set(k, { q, r, t, b: CELL[t].building ? (CELL[t].whole ? t : k) : null }); }
    for (const row of EDGE) for (const [q, r] of row) cells.set(K(q, r), { q, r, t: ',', b: null });
    return `<figure><svg viewBox="-11 -10 22 20">${cellsSvg(cells)}<polygon points="${hexPts(0, 0, 10)}" fill="none" stroke="#0006" stroke-width="0.2"/></svg>${m.name}</figure>`;
  }).join('');
}

$('seed').addEventListener('change', rebuild);
$('radius').addEventListener('input', rebuild);
$('borders').addEventListener('change', draw);
$('labels').addEventListener('change', draw);
$('rnd').addEventListener('click', () => { $('seed').value = Math.floor(Math.random() * 1e6); rebuild(); });
{ const p = new URLSearchParams(location.search); if (p.get('seed')) $('seed').value = p.get('seed'); if (p.get('R')) $('radius').value = p.get('R'); }
initSide(); rebuild();
