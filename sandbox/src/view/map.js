// Карта: окно, которое двигается и масштабируется, клик по гексу (провал вниз или правка дороги), наведение.
// view.L — уровень показываемых клеток; (cx, cy) — центр окна в координатах этого уровня (размер гекса = 1); w — ширина окна.
import { SQ3, toPx, childRound, hexDist, hexPts } from '../core/hex.js';
import { TOP, SIZE, world } from '../world/config.js';
import { wrap } from '../world/topology.js';
import { BIOMES, WATER } from '../world/biomes.js';
import { getCell, getBatch, getTopCells, getTopStats } from '../gen/engine.js';
import { EDITS, applyEdits, editRoad } from '../gen/edits.js';
import { countViolations } from '../checks/seams.js';
import { statsHtml, cellText, linearSvg, iconsSvg } from './render.js';

const svg = document.getElementById('svg'), status = document.getElementById('status'), info = document.getElementById('info');
const view = { L: 4, cx: 0, cy: 0, w: 40 }, ASPECT = 0.75, W_MAX = 80, W_MIN = 6;
let shown = [];

export function startView() {
  const topCells = getTopCells();
  const t = topCells.find(c => c.data.roads && c.data.roads.town) || topCells.find(c => !WATER.has(c.b)) || topCells[0];
  const [x, y] = toPx(t.q, t.r); Object.assign(view, { L: 4, cx: x * 100, cy: y * 100, w: 40 });
}
function setLevel(L) { // переход на другой уровень с тем же центром; ширина окна в клетках сохраняется
  L = Math.max(0, Math.min(TOP, L)); const k = Math.pow(10, view.L - L);
  Object.assign(view, { cx: view.cx * k, cy: view.cy * k, L });
}
function visibleCells() {
  const h = view.w * ASPECT, x0 = view.cx - view.w / 2 - 1, x1 = view.cx + view.w / 2 + 1, y0 = view.cy - h / 2 - 1, y1 = view.cy + h / 2 + 1;
  const inRect = c => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1, cells = [], parents = [];
  if (view.L === TOP) {
    for (let q = Math.floor(x0 / 1.5) - 1; q <= Math.ceil(x1 / 1.5) + 1; q++)
      for (let r = Math.floor(y0 / SQ3 - q / 2) - 1; r <= Math.ceil(y1 / SQ3 - q / 2) + 1; r++) {
        const c = getCell(TOP, q, r); if (!c) continue; const [x, y] = toPx(q, r); const cc = { ...c, x, y }; if (inRect(cc)) cells.push(cc);
      }
    return { cells, parents, batches: [] };
  }
  const batches = [];
  for (let Q = Math.floor(x0 / 15) - 1; Q <= Math.ceil(x1 / 15) + 1; Q++)
    for (let R = Math.floor(y0 / (10 * SQ3) - Q / 2) - 1; R <= Math.ceil(y1 / (10 * SQ3) - Q / 2) + 1; R++) {
      const [px, py] = toPx(Q, R, 10); if (px < x0 - 10 || px > x1 + 10 || py < y0 - 10 || py > y1 + 10) continue;
      const b = getBatch(view.L + 1, Q, R), cs = b.cells.map(c => applyEdits(view.L, c));
      batches.push({ ...b, cells: cs }); parents.push([Q, R, px, py]);
      for (const c of cs) if (inRect(c)) cells.push(c);
    }
  return { cells, parents, batches };
}

let pending = false;
export function render() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); } }
function draw() {
  document.getElementById('editCount').textContent = EDITS.size ? 'клеток с правками: ' + EDITS.size : '';
  const h = view.w * ASPECT;
  // рисуем относительно центра окна: SVG считает в одинарной точности, а координаты глубоких уровней — десятки миллионов
  const ox = view.cx, oy = view.cy;
  svg.setAttribute('viewBox', `${-view.w / 2} ${-h / 2} ${view.w} ${h}`);
  const { cells, parents, batches } = visibleCells(); shown = cells;
  let s = cells.map((c, i) => `<polygon points="${hexPts(c.x - ox, c.y - oy, 1)}" fill="${BIOMES[c.b].color}" stroke="#0002" stroke-width="${(view.w / 700).toFixed(3)}" data-k="${i}"/>`).join('');
  if (view.w <= 45) s += iconsSvg(cells, ox, oy);
  s += linearSvg(cells, ox, oy, view.L) + selRing(view.L, ox, oy);
  s += parents.map(([, , px, py]) => `<polygon points="${hexPts(px - ox, py - oy, 10)}" fill="none" stroke="#222" stroke-width="${(view.w / 400).toFixed(3)}" stroke-dasharray="${view.w / 120} ${view.w / 200}" pointer-events="none"/>`).join('');
  svg.innerHTML = s;
  // сведения об уровне: гекс уровня выше под центром окна
  const [Qc, Rc] = view.L < TOP ? childRound(view.cx / 10, view.cy / 10) : [0, 0];
  let html = `Показан уровень ${view.L} (${SIZE[view.L]}). Мир — тор ${world.N}×${world.N} гексов по ${SIZE[TOP]}: кругосветка за ${world.N} шагов в любую из 6 сторон.<br>`;
  if (view.L < TOP) {
    const b = getBatch(view.L + 1, Qc, Rc), v = countViolations(batches, view.L), [wq, wr] = wrap(view.L + 1, Qc, Rc);
    const rows = [...b.shares].sort((a, c) => c[1] - a[1]).map(([bb, n]) => `<div><span class="sw" style="background:${BIOMES[bb].color}"></span>${BIOMES[bb].name} — ${n}%</div>`).join('');
    html += `Гекс в центре (ур. ${view.L + 1}, ${SIZE[view.L + 1]}, q=${wq}, r=${wr}): <b>${BIOMES[b.dom].name}</b>${rows}${statsHtml(b.stats)}` +
      `<div>На экране: нарушений соседства <b>${v.total}</b> (на стыках ${v.border}), разрывов рек/дорог <b>${v.breaks}</b></div>`;
  } else html += statsHtml(getTopStats());
  info.innerHTML = html + '<div class="meta">Колесо — масштаб (с галочкой «Колесо меняет уровень» — и переход между уровнями), перетаскивание — сдвиг, клик по клетке — провалиться в неё, «▲ выше» — на уровень выше.</div>';
  renderCrumbs();
}

// ---- правка дорог мышью: клик по клетке, затем по соседней ----
let editSel = null;
export const clearSelection = () => { editSel = null; };
const editOn = () => document.getElementById('editMode').checked;
function editClick(lvl, c) {
  if (!editOn()) return false;
  const v = document.getElementById('editType').value, t = v === 'del' ? null : +v;
  if (editSel && editSel.lvl === lvl && hexDist([editSel.q, editSel.r], [c.q, c.r]) === 1) status.textContent = editRoad(lvl, editSel, c, t);
  else status.textContent = 'выбрана клетка — кликни соседнюю, чтобы проложить/удалить отрезок';
  editSel = { lvl, q: c.q, r: c.r, data: c.data }; render(); return true;
}
const selRing = (lvl, ox, oy) => { if (!editSel || editSel.lvl !== lvl || !editOn()) return ''; const [x, y] = toPx(editSel.q, editSel.r); return `<polygon points="${hexPts(x - ox, y - oy, 0.85)}" fill="none" stroke="#e0007a" stroke-width="0.18" pointer-events="none"/>`; };

// ---- мышь: перетаскивание, колесо, клик, наведение ----
const svgPoint = e => { const r = svg.getBoundingClientRect(), h = view.w * ASPECT; return [view.cx - view.w / 2 + (e.clientX - r.left) / r.width * view.w, view.cy - h / 2 + (e.clientY - r.top) / r.height * h]; };
let drag = null;
// клетку запоминаем до захвата указателя: после него события идут на svg
svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false, k: e.target.dataset && e.target.dataset.k }; svg.setPointerCapture(e.pointerId); });
svg.addEventListener('pointermove', e => {
  if (drag) {
    const r = svg.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) { view.cx = drag.cx - dx / r.width * view.w; view.cy = drag.cy - dy / r.height * view.w * ASPECT; render(); return; }
  }
  const k = e.target.dataset && e.target.dataset.k; if (k == null || !shown[+k]) return;
  const c = shown[+k], [wq, wr] = wrap(view.L, c.q, c.r); status.textContent = cellText(view.L, c, `q=${wq}, r=${wr}`);
});
svg.addEventListener('pointerup', () => {
  const d = drag; drag = null; if (!d || d.moved) return;
  const k = d.k; if (k == null || !shown[+k]) return;
  const c = shown[+k]; if (editClick(view.L, c)) return;
  if (view.L > 0) { view.cx = c.x; view.cy = c.y; setLevel(view.L - 1); view.w = 25; render(); }
});
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const [px, py] = svgPoint(e), f = Math.pow(1.0015, e.deltaY);
  view.w *= f; view.cx = px + (view.cx - px) * f; view.cy = py + (view.cy - py) * f;
  const wheelLevels = document.getElementById('wheelLevels').checked; // без галочки колесо только масштабирует внутри уровня
  if (wheelLevels && view.w > W_MAX && view.L < TOP) { setLevel(view.L + 1); view.w /= 10; }
  else if (wheelLevels && view.w < W_MIN && view.L > 0) { setLevel(view.L - 1); view.w *= 10; }
  view.w = Math.max(3, Math.min(view.L === TOP ? 3 * world.N : W_MAX, view.w));
  render();
}, { passive: false });
svg.addEventListener('mouseleave', () => { status.textContent = ''; });

function renderCrumbs() {
  const el = document.getElementById('crumbs');
  el.innerHTML = `Уровень: <b>${SIZE[view.L]}</b> <button data-a="up" ${view.L >= TOP ? 'disabled' : ''}>▲ выше</button> <button data-a="down" ${view.L <= 0 ? 'disabled' : ''}>▼ ниже</button> <button data-a="home">⌂ к старту</button>`;
  el.onclick = e => { const a = e.target.dataset.a; if (!a) return; if (a === 'home') startView(); else setLevel(view.L + (a === 'up' ? 1 : -1)); render(); };
}
