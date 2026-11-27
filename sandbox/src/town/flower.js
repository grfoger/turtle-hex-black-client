// Модуль-цветок: 7 гексов по 10 м (~30 м поперёк). План в метрах, центр цветка — в центре клетки 1 м (0, 0).
// Договор границы: 18 внешних рёбер гексов 10 м, у каждого код — улица поперёк / полуулица вдоль / глухая;
// вдоль границы нейтральная полоса 1,5 м без построек. Внутри — сплошные ряды домов вдоль улиц (город, а не село).
// Стены — по правилам walls.js (углы 30°·k, «удобные» прямые решётки), двери и окна — только в настоящих проходах клеток.
import { hexNorm } from '../core/hex.js';
import { rngFrom, strHash } from '../core/random.js';
import { frame, rectPoly } from './walls.js';
import { overlap, inPoly } from './quarter.js';

export const R10 = 10 / Math.sqrt(3);    // радиус гекса 10 м
export const BAND = 1.5;                 // нейтральная полоса у границы, м
const NS = strHash('flower');
export const CELLS10 = [[0, 0], ...[30, 90, 150, 210, 270, 330].map(a => [10 * Math.cos(a * Math.PI / 180), 10 * Math.sin(a * Math.PI / 180)])];
const hexP = (x, y, s) => Array.from({ length: 6 }, (_, k) => [x + s * Math.cos(Math.PI / 3 * k), y + s * Math.sin(Math.PI / 3 * k)]);

// внешние рёбра цветка: [начало, конец, середина]
export const EDGES = (() => { const out = []; for (const [x, y] of CELLS10) { const P = hexP(x, y, R10);
  P.forEach((v, k) => { const w = P[(k + 1) % 6], m = [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2];
    if (!CELLS10.some(([cx, cy]) => (cx !== x || cy !== y) && Math.hypot(m[0] - cx, m[1] - cy) < R10)) out.push({ a: v, b: w, m }); }); } return out; })();
export const inFlower = (x, y) => CELLS10.some(([cx, cy]) => hexNorm(x - cx, y - cy, R10) <= 1 + 1e-9);
const dSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const edgeDist = p => Math.min(...EDGES.map(e => dSeg(p, e.a, e.b)));
// многоугольник целиком в цветке и не ближе margin к границе (проверяем точки по периметру через 0,5 м)
function insideBand(poly, margin) {
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    for (let j = 0; j < n; j++) { const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]; if (!inFlower(...p) || edgeDist(p) < margin - 1e-6) return false; } }
  return true;
}
const segPoly = (A, B, w) => { const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(...d), n = [-d[1] / L * w / 2, d[0] / L * w / 2];
  return [[A[0] + n[0], A[1] + n[1]], [B[0] + n[0], B[1] + n[1]], [B[0] - n[0], B[1] - n[1]], [A[0] - n[0], A[1] - n[1]]]; };

// ---- типы помещений: какая обстановка и пол ----
export const ROOM = {
  shop: { name: 'Лавка', floor: 'plank' }, dwelling: { name: 'Горница', floor: 'plank' }, kitchen: { name: 'Кухня', floor: 'tile' },
  workshop: { name: 'Мастерская', floor: 'stone' }, bakery: { name: 'Пекарня', floor: 'tile' }, bedroom: { name: 'Спальня', floor: 'plank' },
  tavern: { name: 'Зал таверны', floor: 'plank' }, store: { name: 'Кладовая', floor: 'stone' },
};
// что на первом этаже по фасаду и что в глубине
const KINDS = [
  { front: 'shop', back: 'kitchen' }, { front: 'dwelling', back: 'kitchen' }, { front: 'workshop', back: 'store' },
  { front: 'shop', back: 'store' }, { front: 'bakery', back: 'kitchen' }, { front: 'dwelling', back: 'bedroom' },
];

// План: коды рёбер (улицы и полуулицы), улицы, ряды домов, дворы.
export function buildFlowerPlan(seed = 1) {
  const rng = rngFrom(NS, seed);
  // улицы: главная север–юг (через середины верхнего и нижнего рёбер), переулок на юго-восток, полуулица вдоль юго-западных рёбер
  const streets = [
    { A: [0, -17], B: [0, 17], w: 4, k: 3, name: 'main' },
    { A: [0, 0], B: [15, 8.66], w: 3, k: 1, name: 'lane' },
  ];
  const half = EDGES.filter(e => e.m[0] < -6 && e.m[1] > 1.5);           // три ребра юго-западного гекса
  const exits = [[0, -15], [0, 15], [12.99, 7.5]];                        // улицы поперёк рёбер (середины рёбер)
  const obstacles = streets.map(s => segPoly(s.A, s.B, s.w));
  const nearHalf = p => half.some(e => dSeg(p, e.a, e.b) < 2 - 1e-6);    // полоса полуулицы — 2 м от рёбер
  const buildings = [];
  const fits = b => { const poly = rectPoly(b); if (!insideBand(poly, BAND) || poly.some(nearHalf) || obstacles.some(o => overlap(poly, o))) return null;
    // и ни одна точка периметра не залезает в полосу полуулицы
    for (let i = 0; i < 4; i++) { const a = poly[i], c = poly[(i + 1) % 4]; for (let j = 1; j < 6; j++) if (nearHalf([a[0] + (c[0] - a[0]) * j / 6, a[1] + (c[1] - a[1]) * j / 6])) return null; }
    return poly; };

  // ряд домов вдоль улицы: фасад на линии решётки не ближе d от оси улицы, дома вплотную (общие стены), иногда подворотня во двор
  function terrace(P0, k, d, side, uFrom, uTo, opts = {}) {
    const f = frame(k, P0), vLine = ((P0[0] - f.o[0]) * f.ev[0] + (P0[1] - f.o[1]) * f.ev[1]) / f.dv;
    const vFront = side > 0 ? Math.ceil(vLine + d / f.dv - 1e-9) : Math.floor(vLine - d / f.dv + 1e-9);
    const uOf = X => ((X[0] - f.o[0]) * f.eu[0] + (X[1] - f.o[1]) * f.eu[1]) / f.du;
    let u = Math.ceil(uOf(uFrom)); const uEnd = Math.floor(uOf(uTo)); let n = 0;
    const [fMin, fMax] = opts.front || [4, 6.5];
    while (u < uEnd) {
      // желаемая ширина фасада; если не влезает — пробуем уже (до 3 м) и мельче (до 3,5 м вглубь)
      const want = Math.round(fMin / f.du + rng() * (fMax - fMin) / f.du), minW = Math.round((opts.minFront || 3) / f.du);
      let placed = false;
      for (let ws = want; ws >= minW && !placed; ws--)
      for (let ds = Math.round((opts.depth || 8.5) / f.dv); ds >= Math.round(3.5 / f.dv) && !placed; ds--) {
        const v = side > 0 ? [vFront, vFront + ds] : [vFront - ds, vFront];
        const kind = opts.kind || KINDS[Math.floor(rng() * KINDS.length)];
        const b = { k, at: P0, u: [u, u + ws], v, side, kind, f };
        const poly = fits(b);
        if (poly) {
          b.poly = poly; b.doors = [{ wall: side > 0 ? 0 : 2, at: 0.5 }];                 // вход с улицы
          const depthM = ds * f.dv;
          if (depthM >= 6) { const cut = side > 0 ? vFront + Math.round(ds * 0.55) : vFront - Math.round(ds * 0.55);
            b.cuts = [{ axis: 'v', at: cut, door: 0.25 + 0.5 * rng() }];
            b.rooms = side > 0 ? [{ type: kind.front, v: [vFront, cut] }, { type: kind.back, v: [cut, vFront + ds] }] : [{ type: kind.front, v: [cut, vFront] }, { type: kind.back, v: [vFront - ds, cut] }];
            b.doors.push({ wall: side > 0 ? 2 : 0, at: 0.3 + 0.4 * rng() });              // задняя дверь во двор
          } else b.rooms = [{ type: kind.front, v }];
          buildings.push(b); obstacles.push(poly); placed = true; u += ws; n++;
        }
      }
      if (!placed) u += 1;
      else if (opts.max && n >= opts.max) break;
      else if (opts.passage && n % opts.passage === 0) u += Math.round(2.5 / f.du);           // подворотня во двор
    }
  }
  // таверна — самый просторный участок: западная сторона главной улицы, южнее середины
  terrace([0, -17], 3, 2, 1, [0, 1.5], [0, 9], { kind: { front: 'tavern', back: 'kitchen' }, front: [6, 6.5], minFront: 5, depth: 8, max: 1 });
  terrace([0, -17], 3, 2, -1, [0, -15], [0, 15], { passage: 2 });
  terrace([0, -17], 3, 2, 1, [0, -15], [0, 15], { passage: 2 });
  terrace([0, 0], 1, 1.5, -1, [2, 1.2], [15, 8.66], {});
  terrace([0, 0], 1, 1.5, 1, [5, 2.9], [15, 8.66], {});
  // дома вдоль полуулицы (фасадом к юго-западным рёбрам)
  for (const e of half) { const k = ((Math.round(Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) / (Math.PI / 6)) % 12) + 12) % 12;
    const f = frame(k, e.a), toward = [-e.m[0], -e.m[1]], s = Math.sign(toward[0] * f.ev[0] + toward[1] * f.ev[1]) || 1;
    terrace(e.a, k, 2, s, e.a, e.b, { front: [4, 5.5], depth: 6.5 }); }
  return { streets, half, exits, buildings, seed };
}
