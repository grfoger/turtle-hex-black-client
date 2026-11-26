// Векторный план квартала 100 м: улицы от выходов на гранях, площадь, переулки, дома-прямоугольники под углом 30°·k.
// Всё в глобальных метрах; центры клеток 10 м и 1 м совпадают с узлами решётки, поэтому стены домов ложатся на «удобные» прямые.
// Улицы на гранях решает town.js (edgeStreets) — стыки с соседними кварталами сходятся так же, как в клеточном прототипе.
import { DIRS, toPx, hexNorm } from '../core/hex.js';
import { rngFrom, strHash } from '../core/random.js';
import { portXY } from '../features/linear.js';
import { districtOf, edgeStreets } from './town.js';
import { frame, rectPoly } from './walls.js';

const NS = strHash('quarter');
export const QR = 100 / Math.sqrt(3);          // радиус квартала, м (центры кварталов через 100 м)
export const WIDTH = { '=': 6, '.': 4, ',': 2 }; // ширина улиц, м

// районы: площадь в середине, отступ домов от улицы, фасад и глубина домов (м), разрывы между домами, переулки, перегородки
// special — особое здание у площади: [тип, ширина, глубина]
export const VDIST = {
  rich: { plaza: 7, setback: 3, front: [12, 18], depth: [9, 13], gap: [4, 9], gapP: 0.6, alleys: 0, rooms: 10, type: 'H' },
  middle: { plaza: 9, setback: 0, front: [6, 10], depth: [7, 10], gap: [2, 4], gapP: 0.15, alleys: 3, rooms: 8, type: 'h' },
  poor: { plaza: 6, setback: 0, front: [4, 6], depth: [4, 6], gap: [1, 2], gapP: 0.05, alleys: 6, rooms: 99, type: 'p' },
  market: { plaza: 26, setback: 0, front: [5, 8], depth: [6, 9], gap: [1, 2], gapP: 0.05, alleys: 0, rooms: 7, type: 'S' },
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

// ---- план квартала ----
export function buildQuarterPlan(Q, R) {
  const dist = districtOf(Q, R); if (!dist) return null;
  const D = VDIST[dist], rng = rngFrom(NS, Q, R), C = toPx(Q, R, QR);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const insideQ = (p, m = 1.5) => hexNorm(p[0] - C[0], p[1] - C[1], QR) <= 1 - m / (QR * Math.sqrt(3) / 2);
  const streets = [], alleys = [], buildings = [], obstacles = [];

  // 1) площадь: шестиугольник со сторонами вдоль «удобных» прямых
  const plaza = Array.from({ length: 6 }, (_, k) => [C[0] + D.plaza * Math.cos(Math.PI / 3 * k), C[1] + D.plaza * Math.sin(Math.PI / 3 * k)]);
  obstacles.push(plaza);

  // 2) улицы: от выхода на грани внутрь перпендикулярно грани, затем поворот к центру (обе части лежат на прямых решётки)
  const exits = [];
  DIRS.forEach((dir, e) => { const st = edgeStreets(Q, R, e); for (const s of [-1, 0, 1]) if (st[s]) {
    const E = portXY(Q, R, e, s, QR), [dx, dy] = toPx(-dir[0], -dir[1]), L = Math.hypot(dx, dy), d = [dx / L, dy / L];
    const F = [E[0] + d[0] * dot(sub(C, E), d), E[1] + d[1] * dot(sub(C, E), d)], w = WIDTH[st[s]];
    exits.push({ e, s, kind: st[s], p: E });
    for (const sg of [seg(E, F, w, st[s]), seg(F, C, w, st[s])]) if (sg) { streets.push(sg); obstacles.push(segPoly(sg)); }
  } });

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
      const k = (k0 + i) % 12, f = frame(k, C), us = Math.round(W * scale / f.du), vs = Math.round(Dp * scale / f.dv), v0 = Math.ceil((D.plaza * 0.87 + 0.5) / f.dv);
      const b = { k, at: C, u: [-Math.floor(us / 2), Math.ceil(us / 2)], v: [v0, v0 + vs], type, special: true, doors: [{ wall: 0, at: 0.5 }] };
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
  return { Q, R, dist, center: C, plaza, streets, alleys, exits, buildings };
}
