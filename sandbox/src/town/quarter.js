// Векторный план квартала 100 м: улицы от выходов на гранях, площадь, переулки, дома-прямоугольники под углом 30°·k.
// Всё в глобальных метрах; центры клеток 10 м и 1 м совпадают с узлами решётки, поэтому стены домов ложатся на «удобные» прямые.
// Улицы на гранях решает town.js (edgeStreets) — стыки с соседними кварталами сходятся так же, как в клеточном прототипе.
import { DIRS, toPx, hexNorm } from '../core/hex.js';
import { hash, rngFrom, strHash } from '../core/random.js';
import { portXY } from '../features/linear.js';
import { districtOf, edgeStreets } from './town.js';
import { frame, rectPoly, px, cellAt } from './walls.js';

const NS = strHash('quarter');
export const QR = 100 / Math.sqrt(3);          // радиус квартала, м (центры кварталов через 100 м)
export const WIDTH = { '=': 6, '.': 4, ',': 2 }; // ширина улиц, м

// районы: площадь в середине, отступ домов от улицы, фасад и глубина домов (м), разрывы между домами, переулки, перегородки
// special — особое здание у площади: [тип, ширина, глубина]
export const VDIST = {
  rich: { plaza: 0, setback: 3, front: [12, 18], depth: [9, 13], gap: [4, 9], gapP: 0.6, alleys: 0, rooms: 10, type: 'H' },
  middle: { plaza: 0, setback: 0, front: [6, 10], depth: [7, 10], gap: [2, 4], gapP: 0.15, alleys: 3, rooms: 8, type: 'h' },
  poor: { plaza: 0, setback: 0, front: [4, 6], depth: [4, 6], gap: [1, 2], gapP: 0.05, alleys: 6, rooms: 99, type: 'p' },
  market: { plaza: 20, setback: 0, front: [5, 8], depth: [6, 9], gap: [1, 2], gapP: 0.05, alleys: 0, rooms: 7, type: 'S' },
  townhall: { plaza: 13, setback: 0, front: [8, 12], depth: [8, 11], gap: [2, 4], gapP: 0.3, alleys: 0, rooms: 9, type: 'H', special: ['R', 26, 16] },
  temple: { plaza: 11, setback: 0, front: [6, 9], depth: [7, 9], gap: [2, 4], gapP: 0.2, alleys: 1, rooms: 8, type: 'h', special: ['C', 14, 28] },
  tavern: { plaza: 8, setback: 0, front: [6, 9], depth: [7, 9], gap: [1, 3], gapP: 0.15, alleys: 2, rooms: 8, type: 'h', special: ['T', 16, 12] },
};

// ---- геометрия ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export function overlap(P, Q) { // выпуклые многоугольники пересекаются (касание не считается)
  for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length], n = [y1 - y2, x2 - x1], e = 0.02 * Math.hypot(...n);
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of P) { const t = dot(p, n); a = Math.min(a, t); b = Math.max(b, t); }
    for (const p of Q) { const t = dot(p, n); c = Math.min(c, t); d = Math.max(d, t); }
    if (b <= c + e || d <= a + e) return false;
  }
  return true;
}
export function inPoly(p, poly) { // точка внутри выпуклого многоугольника (или на границе)
  let sgn = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(c) < 1e-9) continue; const s = Math.sign(c); if (sgn && s !== sgn) return false; sgn = s; }
  return true;
}
const segPoly = s => { const d = sub(s.B, s.A), L = Math.hypot(...d), u = [d[0] / L, d[1] / L], n = [-u[1] * s.w / 2, u[0] * s.w / 2], h = s.w / 2;
  const A = [s.A[0] - u[0] * h, s.A[1] - u[1] * h], B = [s.B[0] + u[0] * h, s.B[1] + u[1] * h];
  return [[A[0] + n[0], A[1] + n[1]], [B[0] + n[0], B[1] + n[1]], [B[0] - n[0], B[1] - n[1]], [A[0] - n[0], A[1] - n[1]]]; };
const kOf = d => ((Math.round(Math.atan2(d[1], d[0]) / (Math.PI / 6)) % 12) + 12) % 12; // направление в шагах 30°
const seg = (A, B, w, kind) => { const L = Math.hypot(...sub(B, A)); return L < 0.5 ? null : { A, B, w, kind, len: L, k: kOf(sub(B, A)) }; };

// ---- схемы улиц внутри квартала ----
// Ломаные от точки from (м, центр квартала в 0, y вниз) шагами [k, длина]: направление 30°·k (0 — восток, 3 — юг, 9 — север).
// Схема не обязана доходить до граней: выходы потом подтягиваются к ближайшей улице. Концы без выходов — тупики.
// hub — где площадь (если она есть у района). Все ломаные схемы связаны между собой.
export const SCHEMES = [
  { id: 'parallel', name: 'Две параллельные с перемычкой', hub: [1, 2], paths: [
    { from: [-22, -40], moves: [[3, 80]] }, { from: [24, -40], moves: [[3, 80]] }, { from: [-22, 2], moves: [[0, 46]] }] },
  { id: 'court', name: 'Двор-колодец', hub: [-22, -30], paths: [
    { from: [-22, -42], moves: [[3, 84]] }, { from: [-22, -30], moves: [[0, 40], [3, 44]] }, { from: [-22, 22], moves: [[0, 34]] }] },
  { id: 'through', name: 'Улица насквозь с проулками', hub: [0, 0], paths: [
    { from: [-45, 0], moves: [[0, 90]] }, { from: [-16, 0], moves: [[3, 32]] }, { from: [14, 0], moves: [[9, 32]] }] },
  { id: 'fork', name: 'Развилка', hub: [0, -6], paths: [
    { from: [0, -42], moves: [[3, 40]] }, { from: [0, -2], moves: [[1, 42]] }, { from: [0, -2], moves: [[5, 42]] }] },
  { id: 'grid', name: 'Сетка', hub: [0, 0], paths: [
    { from: [-20, -40], moves: [[3, 80]] }, { from: [20, -40], moves: [[3, 80]] }, { from: [-42, -17], moves: [[0, 84]] }, { from: [-42, 17], moves: [[0, 84]] }] },
  { id: 'ring', name: 'Кольцо вокруг квартала', hub: [0, 0], paths: [
    { from: [24, 0], moves: [[4, 24], [6, 24], [8, 24], [10, 24], [0, 24], [2, 24]] }] },
  { id: 'bend', name: 'Изгиб', hub: [10, -20], paths: [
    { from: [-42, -20], moves: [[0, 52], [3, 60]] }, { from: [10, 10], moves: [[6, 36]] }] },
  { id: 'diagonal', name: 'Косая улица с тупиками', hub: [0, -5], paths: [
    { from: [-38, -27], moves: [[1, 84]] }, { from: [-4, -7], moves: [[9, 30]] }, { from: [8, 0], moves: [[3, 30]] }] },
];
const SCHEME = Object.fromEntries(SCHEMES.map(s => [s.id, s]));
// какие схемы годятся району
const SCHEMES_OF = {
  rich: ['parallel', 'through', 'bend', 'diagonal', 'court'], middle: SCHEMES.map(s => s.id), poor: ['grid', 'parallel', 'through', 'court', 'fork'],
  market: ['ring', 'grid', 'fork'], townhall: ['through', 'fork', 'parallel', 'bend'], temple: ['court', 'bend', 'through', 'fork'], tavern: ['fork', 'through', 'diagonal', 'bend'],
};
const dirV = k => [Math.cos(k * Math.PI / 6), Math.sin(k * Math.PI / 6)];
// схема в повороте rot (×60°) и отражении mir, привязанная к решётке 1 м: начало — центр клетки, длины — кратны шагу направления
function placeScheme(sc, rot, mir, C) {
  const tf = ([x, y]) => { if (mir) x = -x; const a = rot * Math.PI / 3; return [C[0] + x * Math.cos(a) - y * Math.sin(a), C[1] + x * Math.sin(a) + y * Math.cos(a)]; };
  const tk = k => (((mir ? 6 - k : k) + 2 * rot) % 12 + 12) % 12, snap = p => px(...cellAt(...p));
  const segs = [];
  for (const path of sc.paths) {
    let P = snap(tf(path.from));
    for (const [k0, len] of path.moves) {
      const k = tk(k0), step = k % 2 ? 1 : Math.sqrt(3), L = Math.max(1, Math.round(len / step)) * step, d = dirV(k);
      const B = [P[0] + d[0] * L, P[1] + d[1] * L]; segs.push([P, B]); P = B;
    }
  }
  return { segs, hub: snap(tf(sc.hub)) };
}
// луч из P в направлении d до осевой линии отрезка s: расстояние или Infinity
function rayHit(P, d, s) {
  const e = sub(s.B, s.A), w = sub(s.A, P), det = e[0] * d[1] - d[0] * e[1]; if (Math.abs(det) < 1e-9) return Infinity;
  const t = (e[0] * w[1] - w[0] * e[1]) / det, u = (d[0] * w[1] - d[1] * w[0]) / det;
  return t > 0.5 && u >= -1e-6 && u <= 1 + 1e-6 ? t : Infinity;
}
const hitNet = (P, d, net) => net.reduce((m, s) => Math.min(m, rayHit(P, d, s)), Infinity);
// как подтянуть выход E (вход внутрь по направлению k) к сети улиц: прямо или с одним поворотом на 60°/90°
function pullExit(E, k, net, insideQ, maxLen) {
  const d = dirV(k); let best = null;
  const t0 = hitNet(E, d, net); if (t0 <= maxLen) best = { cost: t0, pts: [E, [E[0] + d[0] * t0, E[1] + d[1] * t0]] };
  for (let t1 = 3; t1 <= maxLen && (!best || t1 + 6 < best.cost); t1++) {
    const P = [E[0] + d[0] * t1, E[1] + d[1] * t1]; if (!insideQ(P, 3) || t1 >= t0) break;
    for (const dk of [2, -2, 3, -3]) {
      const d2 = dirV((k + dk + 12) % 12), t2 = hitNet(P, d2, net), cost = t1 + t2 + 6;
      if (t2 <= maxLen && (!best || cost < best.cost)) best = { cost, pts: [E, P, [P[0] + d2[0] * t2, P[1] + d2[1] * t2]] };
    }
  }
  return best;
}

// ---- план квартала ----
export function buildQuarterPlan(Q, R) {
  const dist = districtOf(Q, R); if (!dist) return null;
  const D = VDIST[dist], rng = rngFrom(NS, Q, R), C = toPx(Q, R, QR);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const insideQ = (p, m = 1.5) => hexNorm(p[0] - C[0], p[1] - C[1], QR) <= 1 - m / (QR * Math.sqrt(3) / 2);
  const streets = [], alleys = [], buildings = [], obstacles = [];

  // 1) выходы улиц на гранях (их решили рёбра) — главные первыми
  const exits = [];
  DIRS.forEach((dir, e) => { const st = edgeStreets(Q, R, e); for (const s of [-1, 0, 1]) if (st[s]) exits.push({ e, s, kind: st[s], p: portXY(Q, R, e, s, QR), k: kOf(toPx(-dir[0], -dir[1])) }); });
  exits.sort((a, b) => (b.kind === '=') - (a.kind === '='));

  // 2) схема улиц: из подходящих району выбираем схему, поворот и отражение, к которым выходы подтягиваются короче всего
  // у каждой схемы берём её лучший поворот; затем случайно выбираем среди схем, которые не сильно хуже самой удобной
  // (иначе всегда побеждает схема с самым большим числом улиц — к ней ближе всего тянуть)
  const per = [];
  for (const id of SCHEMES_OF[dist]) { let b = null;
    for (let rot = 0; rot < 6; rot++) for (const mir of [0, 1]) {
      const pl = placeScheme(SCHEME[id], rot, mir, C), net = pl.segs.map(([A, B]) => ({ A, B }));
      let cost = 0; for (const x of exits) { const p = pullExit(x.p, x.k, net, insideQ, 0.9 * QR); cost += p ? p.cost : 200; }
      cost += 3 * hash(NS, 7, Q, R, rot, mir); // равные варианты различаем случайно
      if (!b || cost < b.cost) b = { cost, id, rot, mir, pl };
    }
    per.push(b); }
  const minCost = Math.min(...per.map(b => b.cost)), ok = per.filter(b => b.cost <= minCost * 1.4 + 15);
  const best = ok[Math.floor(hash(NS, 8, Q, R) * ok.length)];
  const H = best.pl.hub;
  for (const [A, B] of best.pl.segs) { const sg = seg(A, B, WIDTH['.'], '.'); if (sg) streets.push(sg); }
  // 3) подтягиваем выходы к улицам (каждая новая улица тоже становится частью сети)
  for (const x of exits) {
    const p = pullExit(x.p, x.k, streets, insideQ, 0.9 * QR) || { pts: [x.p, H] };
    for (let i = 0; i + 1 < p.pts.length; i++) { const sg = seg(p.pts[i], p.pts[i + 1], WIDTH[x.kind], x.kind); if (sg) streets.push(sg); }
  }
  for (const sg of streets) obstacles.push(segPoly(sg));
  // площадь — шестиугольник в узле схемы
  const plaza = D.plaza ? Array.from({ length: 6 }, (_, k) => [H[0] + D.plaza * Math.cos(Math.PI / 3 * k), H[1] + D.plaza * Math.sin(Math.PI / 3 * k)]) : null;
  if (plaza) obstacles.push(plaza);

  // 3) переулки: от точки на улице перпендикулярно, до края квартала
  for (let a = 0; a < D.alleys && streets.length; a++) {
    const base = streets[Math.floor(rng() * streets.length)]; if (base.len < 12) continue;
    const f = frame(base.k, base.A), u = Math.floor((0.3 + 0.5 * rng()) * base.len / f.du), A = f.P(u, 0), side = rng() < 0.5 ? 1 : -1;
    const dir = [f.ev[0] * side, f.ev[1] * side]; let len = base.w / 2;
    while (len < 45 && insideQ([A[0] + dir[0] * (len + 1), A[1] + dir[1] * (len + 1)], 2)) len += 1;
    const sg = seg(A, [A[0] + dir[0] * len, A[1] + dir[1] * len], WIDTH[','], ',');
    if (!sg || sg.len < 8) continue;
    const st = base.w / 2 + WIDTH[','] / 2 + 0.05; // прямоугольник переулка начинается у края улицы, не залезая на неё
    const poly = segPoly({ ...sg, A: [A[0] + dir[0] * st, A[1] + dir[1] * st] });
    if (obstacles.some(o => overlap(poly, o))) continue;
    alleys.push(sg); obstacles.push(poly);
  }

  const fits = b => { const poly = rectPoly(b); return poly.every(p => insideQ(p)) && !obstacles.some(o => overlap(poly, o)) ? poly : null; };
  const add = (b, poly) => { b.poly = poly; buildings.push(b); obstacles.push(poly); };

  // 4) особое здание у площади: пробуем 12 сторон, начиная со случайной; не влезло — уменьшаем
  if (D.special) {
    const [type, W, Dp] = D.special, k0 = Math.floor(rng() * 12);
    for (let scale = 1; scale > 0.5 && !buildings.length; scale -= 0.15) for (let i = 0; i < 12 && !buildings.length; i++) {
      const k = (k0 + i) % 12, f = frame(k, H), us = Math.round(W * scale / f.du), vs = Math.round(Dp * scale / f.dv), v0 = Math.ceil((D.plaza * 0.87 + 0.5) / f.dv);
      const b = { k, at: H, u: [-Math.floor(us / 2), Math.ceil(us / 2)], v: [v0, v0 + vs], type, special: true, doors: [{ wall: 0, at: 0.5 }] };
      const poly = fits(b); if (poly) add(b, poly);
    }
  }

  // 5) дома вдоль улиц и переулков с обеих сторон: фасад к улице, соседние дома вплотную (общая стена)
  for (const sg of [...streets, ...alleys]) for (const side of [1, -1]) {
    const f = frame(sg.k, sg.A), vOff = Math.ceil((sg.w / 2 + D.setback) / f.dv), n = Math.floor(sg.len / f.du);
    for (let u = 0; u < n;) {
      const ws = Math.max(2, Math.round(ri(...D.front) / f.du)), ds = Math.max(2, Math.round(ri(...D.depth) / f.dv));
      const v = side > 0 ? [vOff, vOff + ds] : [-vOff - ds, -vOff];
      const b = { k: sg.k, at: sg.A, u: [u, u + ws], v, type: D.type, doors: [{ wall: side > 0 ? 0 : 2, at: 0.3 + 0.4 * rng() }] };
      if (ws * f.du >= D.rooms) b.cuts = [{ axis: 'u', at: u + Math.floor(ws / 2), door: 0.3 + 0.4 * rng() }];
      const poly = fits(b);
      if (!poly) { u += 1; continue; }
      add(b, poly); u += ws;
      if (rng() < D.gapP) u += Math.round(ri(...D.gap) / f.du);
    }
  }
  return { Q, R, dist, center: C, plaza, streets, alleys, exits, buildings, scheme: { name: SCHEME[best.id].name, rot: best.rot * 60, mir: !!best.mir } };
}
