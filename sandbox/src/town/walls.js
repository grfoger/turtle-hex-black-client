// Стены на тактической сетке 1 м (вариант «Б»): стена — вектор, клетка — пол, закрытое ребро — пара соседей, между которыми стена.
// Дома повёрнуты на угол, кратный 30°, стены лежат на «удобных» прямых сетки:
//   вершина–вершина (0°, 60°, 120°): по рёбрам гексов и через противоположные вершины, шаг прямых 0,5 м;
//   грань–грань (30°, 90°, 150°): через центры гексов от середины ребра к середине ребра, шаг прямых √3/2 ≈ 0,87 м.
// У прямоугольника перпендикулярные стороны всегда из разных семейств.
import { DIRS, toPx, childRound } from '../core/hex.js';

export const S = 1 / Math.sqrt(3);                   // радиус гекса, при котором центры соседей в 1 м
export const px = (q, r) => toPx(q, r, S);
export const cellAt = (x, y) => childRound(x / S, y / S);
const STEP_V = 0.5, STEP_E = Math.sqrt(3) / 2, EPS = 1e-6;
// кому достаётся клетка, рассечённая стеной пополам: 'wall' — самой стене (непроходима, ничья),
// 'in' — стороне нормали (внутрь дома), 'out' — наружу,
// 'dir' — по общему направлению на карте: у прямоугольника две стены отдают клетки внутрь, две — наружу (площадь ≈ честная)
export const wallOpts = { tie: 'wall' };
const G = [Math.cos(Math.PI / 12), Math.sin(Math.PI / 12)]; // 15°: не перпендикулярно ни одной нормали (они кратны 30°)

// дом: k — угол 30°·k; at — точка привязки (снапится к центру гекса); u, v — отрезки сетки вдоль и поперёк угла;
// cuts — внутренние стены { axis: 'u'|'v', at, door }; doors — двери во внешних стенах { wall: 0..3, at: 0..1 }
// система координат дома: P(u, v) — точка решётки (u шагов вдоль угла 30°·k, v шагов поперёк) от центра гекса привязки
export function frame(k, at) {
  const th = k * Math.PI / 6, eu = [Math.cos(th), Math.sin(th)], ev = [-Math.sin(th), Math.cos(th)];
  const du = k % 2 ? STEP_V : STEP_E, dv = k % 2 ? STEP_E : STEP_V; // стены вдоль θ: при чётном k — вершина–вершина
  const [aq, ar] = cellAt(...at), [ox, oy] = px(aq, ar);
  return { eu, ev, du, dv, o: [ox, oy], P: (u, v) => [ox + u * du * eu[0] + v * dv * ev[0], oy + u * du * eu[1] + v * dv * ev[1]] };
}
export const rectPoly = b => { const { P } = frame(b.k, b.at); return [P(b.u[0], b.v[0]), P(b.u[1], b.v[0]), P(b.u[1], b.v[1]), P(b.u[0], b.v[1])]; };

export function buildingWalls(b) {
  const { eu, ev, du, dv, P } = frame(b.k, b.at);
  const [u0, u1] = b.u, [v0, v1] = b.v, walls = [];
  // наружные стены; нормаль смотрит внутрь (клетка, рассечённая стеной пополам, считается внутренней)
  const outer = [[P(u0, v0), P(u1, v0), ev], [P(u1, v0), P(u1, v1), eu.map(x => -x)], [P(u1, v1), P(u0, v1), ev.map(x => -x)], [P(u0, v1), P(u0, v0), eu]];
  outer.forEach(([A, B, n], i) => walls.push(wall(A, B, n, (b.doors || []).filter(d => d.wall === i).map(d => d.at), i % 2 ? 'грань–грань' : 'вершина–вершина', b.k)));
  for (const c of b.cuts || []) {
    const [A, B, n] = c.axis === 'u' ? [P(c.at, v0), P(c.at, v1), eu] : [P(u0, c.at), P(u1, c.at), ev];
    walls.push(wall(A, B, n, c.door != null ? [c.door] : [], c.axis === 'u' ? 'грань–грань' : 'вершина–вершина', b.k, true));
  }
  return { walls, size: [(u1 - u0) * du, (v1 - v0) * dv] };
}
function wall(A, B, n, doorsAt, kind, k, inner = false) {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]), dir = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  // тип стены: при нечётном k семейства меняются местами
  if (k % 2) kind = kind === 'вершина–вершина' ? 'грань–грань' : 'вершина–вершина';
  const doors = doorsAt.map(t => [t * len - 0.5, t * len + 0.5]); // дверь шириной 1 м
  const tie = wallOpts.tie === 'in' || wallOpts.tie === 'wall' ? 1 : wallOpts.tie === 'out' ? -1 : Math.sign(n[0] * G[0] + n[1] * G[1]);
  return { A, B, n, len, dir, doors, kind, inner, tie };
}

const side = (p, w) => { const s = (p[0] - w.A[0]) * w.n[0] + (p[1] - w.A[1]) * w.n[1]; return Math.abs(s) < EPS ? EPS * w.tie : s; };
// закрыт ли проход между соседними клетками (центры p1, p2) стеной w; open — двери открыты
export function blocks(w, p1, p2, open = true) {
  if (wallOpts.tie === 'wall' && (onWall(w, p1) || onWall(w, p2))) return false; // проход решает сама клетка-стена
  const s1 = side(p1, w), s2 = side(p2, w); if ((s1 > 0) === (s2 > 0)) return false;
  const t = s1 / (s1 - s2), x = p1[0] + (p2[0] - p1[0]) * t, y = p1[1] + (p2[1] - p1[1]) * t;
  const tau = (x - w.A[0]) * w.dir[0] + (y - w.A[1]) * w.dir[1];
  if (tau < -EPS || tau > w.len + EPS) return false;
  return !(open && w.doors.some(([a, b]) => tau > a && tau < b));
}
// центр клетки лежит на стене (клетка рассечена пополам): 'wall' | 'door' (в проёме двери) | null
export function onWall(w, p) {
  const s = (p[0] - w.A[0]) * w.n[0] + (p[1] - w.A[1]) * w.n[1]; if (Math.abs(s) >= EPS) return null;
  const tau = (p[0] - w.A[0]) * w.dir[0] + (p[1] - w.A[1]) * w.dir[1]; if (tau < -EPS || tau > w.len + EPS) return null;
  return w.doors.some(([a, b]) => tau > a && tau < b) ? 'door' : 'wall';
}
// рассекает ли стена гекс (для подсветки)
export function cuts(w, p) {
  const s = (p[0] - w.A[0]) * w.n[0] + (p[1] - w.A[1]) * w.n[1], tau = (p[0] - w.A[0]) * w.dir[0] + (p[1] - w.A[1]) * w.dir[1];
  if (tau < -0.3 || tau > w.len + 0.3) return false;
  let h = 0; for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; h = Math.max(h, S * (Math.cos(a) * w.n[0] + Math.sin(a) * w.n[1])); }
  return Math.abs(s) < h - EPS;
}

// карта: клетки в прямоугольнике (и где keep(x, y)), закрытые рёбра, комнаты (связные области).
// Клетки раскладываются по корзинам 4 м, каждая стена проверяет только клетки рядом с собой.
export function buildMap(buildings, [x0, y0, x1, y1], open, keep = () => true) {
  const walls = buildings.flatMap(b => buildingWalls(b).walls), cells = new Map(), bucket = new Map(), BK = 4;
  const [qa] = cellAt(x0, 0), [qb] = cellAt(x1, 0);
  for (let q = qa - 1; q <= qb + 1; q++) for (let r = Math.floor(y0 - q / 2) - 1; r <= Math.ceil(y1 - q / 2) + 1; r++) { // y = r + q/2 (м)
    const [x, y] = px(q, r); if (x < x0 || x > x1 || y < y0 || y > y1 || !keep(x, y)) continue;
    const c = { q, r, x, y, cut: false, wall: false, door: false }; cells.set(q + ',' + r, c);
    const bk = Math.floor(x / BK) + ',' + Math.floor(y / BK); if (!bucket.has(bk)) bucket.set(bk, []); bucket.get(bk).push(c);
  }
  const near = w => { const res = [], xa = Math.min(w.A[0], w.B[0]) - 1.2, xb = Math.max(w.A[0], w.B[0]) + 1.2, ya = Math.min(w.A[1], w.B[1]) - 1.2, yb = Math.max(w.A[1], w.B[1]) + 1.2;
    for (let i = Math.floor(xa / BK); i <= Math.floor(xb / BK); i++) for (let j = Math.floor(ya / BK); j <= Math.floor(yb / BK); j++) for (const c of bucket.get(i + ',' + j) || []) if (c.x >= xa && c.x <= xb && c.y >= ya && c.y <= yb) res.push(c);
    return res; };
  // дверь привязываем к ближайшему проходу через стену: рассечённая клетка или пара соседей по разные стороны
  const tauOf = (w, p) => (p[0] - w.A[0]) * w.dir[0] + (p[1] - w.A[1]) * w.dir[1], sOf = (w, p) => (p[0] - w.A[0]) * w.n[0] + (p[1] - w.A[1]) * w.n[1];
  for (const w of walls) w.near = near(w);
  // клетки, через центр которых проходит стена (рассечённые): какие стены их режут
  const onW = new Map();
  for (const w of walls) for (const c of w.near) if (onWall(w, [c.x, c.y])) { if (!onW.has(c)) onW.set(c, []); onW.get(c).push(w); }
  const busy = (c, w) => (onW.get(c) || []).some(o => o !== w); // клетку режет другая стена (стык, перегородка)
  for (const w of walls) if (w.doors.length) {
    const pass = [];
    for (const c of w.near) {
      const s = sOf(w, [c.x, c.y]); if (Math.abs(s) > 1.2 || busy(c, w)) continue;
      if (Math.abs(s) < EPS) { pass.push(tauOf(w, [c.x, c.y])); continue; }
      DIRS.forEach(([a, b], j) => { if (j > 2) return; const n = cells.get((c.q + a) + ',' + (c.r + b)); if (!n || busy(n, w)) return;
        const s2 = sOf(w, [n.x, n.y]); if (Math.abs(s2) < EPS || (s > 0) === (s2 > 0)) return;
        const t = s / (s - s2); pass.push(tauOf(w, [c.x + (n.x - c.x) * t, c.y + (n.y - c.y) * t])); });
    }
    const inside = pass.filter(t => t > 0.3 && t < w.len - 0.3);
    w.doors = w.doors.map(([a, b]) => { const m = (a + b) / 2, t = inside.reduce((x, y) => Math.abs(y - m) < Math.abs(x - m) ? y : x, inside[0] ?? m); return [t - 0.4, t + 0.4]; });
  }
  const closed = [], shut = new Set(), pk = (c, n) => c.q + ',' + c.r + '|' + n.q + ',' + n.r;
  for (const w of walls) for (const c of w.near) DIRS.forEach(([a, b], j) => {
    if (j > 2) return; const n = cells.get((c.q + a) + ',' + (c.r + b)); if (!n || shut.has(pk(c, n))) return;
    if (blocks(w, [c.x, c.y], [n.x, n.y], open)) { shut.add(pk(c, n)); closed.push([c, n, j]); }
  });
  // соседи «снизу» (j > 2) тоже могут быть рядом со стеной, а клетка c — нет: проверяем пары с обеих сторон
  for (const w of walls) for (const n of w.near) DIRS.forEach(([a, b], j) => {
    if (j > 2) return; const c = cells.get((n.q - a) + ',' + (n.r - b)); if (!c || shut.has(pk(c, n))) return;
    if (blocks(w, [c.x, c.y], [n.x, n.y], open)) { shut.add(pk(c, n)); closed.push([c, n, j]); }
  });
  const isShut = (c, n) => shut.has(pk(c, n)) || shut.has(pk(n, c));
  // правило 'wall': рассечённая клетка принадлежит стене — непроходима; в проёме двери — проходима, если дверь открыта
  const doorCells = new Set();
  for (const w of walls) for (const c of w.near) {
    if (cuts(w, [c.x, c.y])) c.cut = true;
    const on = wallOpts.tie === 'wall' ? onWall(w, [c.x, c.y]) : null;
    if (on === 'wall') c.wall = true; else if (on === 'door') doorCells.add(c);
  }
  for (const c of cells.values()) { c.door = !c.wall && doorCells.has(c); c.pass = !c.wall && (!c.door || open); }
  const region = (start) => { const seen = new Set([start.q + ',' + start.r]), st = start.pass ? [start] : [];
    while (st.length) { const c = st.pop(); for (const [a, b] of DIRS) { const k = (c.q + a) + ',' + (c.r + b), n = cells.get(k); if (n && n.pass && !seen.has(k) && !isShut(c, n)) { seen.add(k); st.push(n); } } }
    return seen; };
  return { walls, cells, closed, region };
}
