// Модуль-цветок: 7 гексов по 10 м (~30 м поперёк). План в метрах, центр цветка — в центре клетки 1 м (0, 0).
// Договор границы: у каждого из 18 внешних рёбер гексов 10 м код:
//   street — улица поперёк ребра (через середину); half — полуулица вдоль (2 м с каждой стороны);
//   wall — общая стена: дом стоит вплотную, его стена лежит на ребре (сосед ставит свою туда же);
//   blank — глухая граница с нейтральной полосой 1,5 м без построек.
// Стены — по правилам walls.js (углы 30°·k, «удобные» прямые решётки), двери, арки и окна — в настоящих проходах клеток.
import { hexNorm } from '../core/hex.js';
import { rngFrom, strHash } from '../core/random.js';
import { frame, rectPoly } from './walls.js';
import { overlap } from './quarter.js';

export const R10 = 10 / Math.sqrt(3);    // радиус гекса 10 м
export const BAND = 1.5;                 // нейтральная полоса у глухой границы, м
const NS = strHash('flower');
export const CELLS10 = [[0, 0], ...[30, 90, 150, 210, 270, 330].map(a => [10 * Math.cos(a * Math.PI / 180), 10 * Math.sin(a * Math.PI / 180)])];
const hexP = (x, y, s) => Array.from({ length: 6 }, (_, k) => [x + s * Math.cos(Math.PI / 3 * k), y + s * Math.sin(Math.PI / 3 * k)]);
const deg = (dx, dy) => ((Math.round(Math.atan2(dy, dx) * 180 / Math.PI / 30) * 30) % 360 + 360) % 360;

// внешние рёбра цветка: начало, конец, середина; cell — угол внешнего гекса (30…330), dir — куда смотрит ребро наружу
export const EDGES = (() => { const out = []; for (const [x, y] of CELLS10) { const P = hexP(x, y, R10);
  P.forEach((v, k) => { const w = P[(k + 1) % 6], m = [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2];
    if (!CELLS10.some(([cx, cy]) => (cx !== x || cy !== y) && Math.hypot(m[0] - cx, m[1] - cy) < R10)) out.push({ a: v, b: w, m, cell: deg(x, y), dir: deg(m[0] - x, m[1] - y) }); }); } return out; })();
export const inFlower = (x, y) => CELLS10.some(([cx, cy]) => hexNorm(x - cx, y - cy, R10) <= 1 + 1e-7);
const dSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const segPoly = (A, B, w) => { const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(...d), n = [-d[1] / L * w / 2, d[0] / L * w / 2];
  return [[A[0] + n[0], A[1] + n[1]], [B[0] + n[0], B[1] + n[1]], [B[0] - n[0], B[1] - n[1]], [A[0] - n[0], A[1] - n[1]]]; };

export const ROOM = {
  shop: { name: 'Лавка', floor: 'plank' }, dwelling: { name: 'Горница', floor: 'plank' }, kitchen: { name: 'Кухня', floor: 'tile' },
  workshop: { name: 'Мастерская', floor: 'stone' }, bakery: { name: 'Пекарня', floor: 'tile' }, bedroom: { name: 'Спальня', floor: 'plank' },
  tavern: { name: 'Зал таверны', floor: 'plank' }, store: { name: 'Кладовая', floor: 'stone' }, hall: { name: 'Зал гильдии', floor: 'tile' },
};
const FRONTS = ['shop', 'dwelling', 'workshop', 'shop', 'bakery', 'dwelling'], BACKS = ['kitchen', 'store', 'bedroom', 'kitchen'], WINGS = ['workshop', 'kitchen', 'bedroom', 'store'];

// варианты цветка: коды рёбер ('cell:dir' → код) и что строить
export const VARIANTS = [
  { id: 'wings', name: 'Большие дома с крыльями (Г и Т)', codes: {} },
  { id: 'party', name: 'Общие стены на границе', codes: { '330:270': 'wall', '330:330': 'wall', '330:30': 'wall', '30:330': 'wall', '30:30': 'wall', '30:90': 'wall', '210:150': 'half', '210:210': 'half', '210:270': 'half' } },
  { id: 'court', name: 'Двор-колодец и дома под разными углами', codes: { '330:330': 'wall', '330:30': 'wall', '30:30': 'wall', '30:90': 'wall', '150:90': 'half', '150:150': 'half', '150:210': 'half' } },
];

export function buildFlowerPlan(seed = 1, variantId = 'wings') {
  const V = VARIANTS.find(v => v.id === variantId) || VARIANTS[0], rng = rngFrom(NS, seed, strHash(V.id));
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1)), pick = a => a[Math.floor(rng() * a.length)];
  // коды рёбер: улицы сверху и снизу всегда (главная улица север–юг), остальное — из варианта, по умолчанию глухая
  for (const e of EDGES) e.code = (e.cell === 270 && e.dir === 270) || (e.cell === 90 && e.dir === 90) ? 'street' : (V.codes[e.cell + ':' + e.dir] || 'blank');
  const margin = e => e.code === 'wall' ? 0 : e.code === 'half' ? 2 : BAND;
  const streets = [{ A: [0, -17], B: [0, 17], w: 4, k: 3 }];
  const obstacles = streets.map(s => segPoly(s.A, s.B, s.w)), buildings = [];
  // часть дома влезает: вся в цветке, не ближе положенного к рёбрам (у общей стены — можно вплотную), не на улице и не на других
  function fits(poly) {
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
      for (let j = 0; j < n; j++) { const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n];
        if (!inFlower(...p) || EDGES.some(e => dSeg(p, e.a, e.b) < margin(e) - 1e-6)) return false; } }
    return !obstacles.some(o => overlap(poly, o));
  }
  // часть дома: прямоугольник в системе (k, at); side — с какой стороны фасад (комнаты рисуются от него вглубь)
  function part(k, at, u, v, side, rooms, extra = {}) {
    const b = { k, at, u, v, side, f: frame(k, at), rooms, doors: [], cuts: [], ...extra }, poly = rectPoly(b);
    if (!fits(poly)) return null; b.poly = poly; return b;
  }
  const add = b => { buildings.push(b); obstacles.push(b.poly); return b; };
  const mid = (b, u, v) => b.f.P(u, v);
  // арка между двумя частями: точка на общей стене, ширина len
  function arch(b1, w1, b2, w2, p, len) { b1.doors.push({ wall: w1, p, len, arch: true }); b2.doors.push({ wall: w2, p, len, arch: true }); }

  // ряд домов вдоль улицы; дом = передний корпус (+ задняя комната) и иногда крыло вглубь (Г слева/справа или Т)
  function terrace(P0, k, d, side, yFrom, yTo, o) {
    const f = frame(k, P0), vLine = ((P0[0] - f.o[0]) * f.ev[0] + (P0[1] - f.o[1]) * f.ev[1]) / f.dv;
    const vFront = side > 0 ? Math.ceil(vLine + d / f.dv - 1e-9) : Math.floor(vLine - d / f.dv + 1e-9);
    const uOf = X => ((X[0] - f.o[0]) * f.eu[0] + (X[1] - f.o[1]) * f.eu[1]) / f.du;
    let u = Math.ceil(uOf(yFrom)); const uEnd = Math.floor(uOf(yTo));
    while (u < uEnd) {
      let main = null;
      for (let ws = Math.round(ri(...o.front) / f.du); ws >= Math.round(3 / f.du) && !main; ws--)
        for (let ds = Math.round(ri(...o.depth) / f.dv); ds >= Math.round(3.5 / f.dv) && !main; ds--) {
          const v = side > 0 ? [vFront, vFront + ds] : [vFront - ds, vFront], front = o.front0 || pick(FRONTS);
          const deep = ds * f.dv >= 6, cut = side > 0 ? vFront + Math.round(ds * 0.55) : vFront - Math.round(ds * 0.55);
          const rooms = deep ? (side > 0 ? [{ type: front, v: [vFront, cut] }, { type: pick(BACKS), v: [cut, v[1]] }] : [{ type: front, v: [cut, vFront] }, { type: pick(BACKS), v: [v[0], cut] }]) : [{ type: front, v }];
          main = part(k, P0, [u, u + ws], v, side, rooms);
          if (main && deep) main.cuts.push({ axis: 'v', at: cut, door: 0.25 + 0.5 * rng() });
        }
      if (!main) { u += 1; continue; }
      add(main); main.doors.push({ wall: side > 0 ? 0 : 2, at: 0.5 });                // вход с улицы
      const vBack = side > 0 ? main.v[1] : main.v[0], backWall = side > 0 ? 2 : 0, wingFront = side > 0 ? 0 : 2;
      let wing = null;
      if (o.wings && rng() < o.wings) {                                              // крыло вглубь участка
        const W = main.u[1] - main.u[0], shape = pick(['L', 'R', 'T']);
        for (let ww = Math.min(W - 2, Math.round(ri(4, 6) / f.du)); ww >= Math.round(3 / f.du) && !wing; ww--)
          for (let wd = Math.round(ri(4, 7) / f.dv); wd >= Math.round(3 / f.dv) && !wing; wd--) {
            const wu = shape === 'L' ? [main.u[0], main.u[0] + ww] : shape === 'R' ? [main.u[1] - ww, main.u[1]] : [main.u[0] + Math.floor((W - ww) / 2), main.u[0] + Math.floor((W - ww) / 2) + ww];
            const wv = side > 0 ? [vBack, vBack + wd] : [vBack - wd, vBack];
            wing = part(k, P0, wu, wv, side, [{ type: pick(WINGS), v: wv }], { wingOf: main });
          }
        if (wing) { add(wing); const uc = (wing.u[0] + wing.u[1]) / 2, len = Math.min(3, (wing.u[1] - wing.u[0]) * f.du - 1.4);
          arch(main, backWall, wing, wingFront, mid(main, uc, vBack), Math.max(1, len));            // помещение в форме Г или Т
          wing.doors.push({ wall: side > 0 ? 2 : 0, at: 0.5 }); }                                  // из крыла во двор
      }
      // задняя дверь корпуса во двор — в стороне от крыла
      if (!wing) main.doors.push({ wall: backWall, at: 0.3 + 0.4 * rng() });
      else { const free = wing.u[0] - main.u[0] > main.u[1] - wing.u[1] ? (main.u[0] + wing.u[0]) / 2 : (wing.u[1] + main.u[1]) / 2;
        if (Math.abs(free - (wing.u[0] + wing.u[1]) / 2) * f.du > 2) main.doors.push({ wall: backWall, p: mid(main, free, vBack) }); }
      u = main.u[1] + (o.passage && rng() < o.passage ? Math.round(2.5 / f.du) : 0);           // подворотня во двор
    }
  }

  // дом вплотную к ребру с общей стеной: стена дома лежит на ребре, дом развёрнут по ребру (0°, 60° или 120°)
  function wallHouse(e, o = {}) {
    const k = ((Math.round(Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) / (Math.PI / 6)) % 12) + 12) % 12, f = frame(k, e.a);
    const vEdge = Math.round(((e.a[0] - f.o[0]) * f.ev[0] + (e.a[1] - f.o[1]) * f.ev[1]) / f.dv), s = Math.sign(-e.m[0] * f.ev[0] - e.m[1] * f.ev[1]) || 1;
    const ua = ((e.a[0] - f.o[0]) * f.eu[0] + (e.a[1] - f.o[1]) * f.eu[1]) / f.du, ub = ((e.b[0] - f.o[0]) * f.eu[0] + (e.b[1] - f.o[1]) * f.eu[1]) / f.du;
    const U0 = Math.ceil(Math.min(ua, ub) - 1e-6), U1 = Math.floor(Math.max(ua, ub) + 1e-6);
    for (let trim = 0; trim <= 6; trim++) for (let lo = 0; lo <= trim; lo++) {               // сужаем, если упирается в соседние рёбра
      const u = [U0 + lo, U1 - (trim - lo)]; if (u[1] - u[0] < Math.round(3 / f.du)) continue;
      for (let ds = Math.round((o.depth || 6) / f.dv); ds >= Math.round(3.5 / f.dv); ds--) {
        const v = s > 0 ? [vEdge, vEdge + ds] : [vEdge - ds, vEdge], b = part(k, e.a, u, v, -s, [{ type: o.type || pick(FRONTS), v }], { onEdge: e });
        if (b) { add(b); b.doors.push({ wall: s > 0 ? 2 : 0, at: 0.5 }); return b; }        // вход с внутренней стороны
      }
    }
    return null;
  }

  // ---- варианты ----
  if (V.id === 'wings') {
    terrace([0, -17], 3, 2, -1, [0, -14], [0, 14], { front: [7, 10], depth: [5, 6], wings: 0.9 });
    terrace([0, -17], 3, 2, 1, [0, -14], [0, 14], { front: [7, 10], depth: [5, 6], wings: 0.9 });
  } else if (V.id === 'party') {
    for (const e of EDGES.filter(e => e.code === 'wall')) wallHouse(e, { depth: 6 });
    terrace([0, -17], 3, 2, -1, [0, -14], [0, 14], { front: [5, 7], depth: [4, 5], passage: 0.5 });
    terrace([0, -17], 3, 2, 1, [0, -14], [0, 14], { front: [7, 9], depth: [5, 6], wings: 0.8 });
  } else {
    // двор-колодец: корпус по улице + два крыла поперёк, двор между ними
    const f = frame(3, [0, -17]), vF = 3, U = [Math.round(9.5 / f.du), Math.round(23.5 / f.du)], D = Math.round(5 / f.dv);
    const front = part(3, [0, -17], U, [vF, vF + D], 1, [{ type: 'hall', v: [vF, vF + D] }]);
    if (front) { add(front); front.doors.push({ wall: 0, at: 0.5, len: 2 }, { wall: 2, at: 0.5 });
      for (const [lo, side] of [[U[0], 'n'], [U[1] - Math.round(4 / f.du), 's']]) {
        const wu = [lo, lo + Math.round(4 / f.du)];
        for (let wd = Math.round(6 / f.dv); wd >= 3; wd--) { const w = part(3, [0, -17], wu, [vF + D, vF + D + wd], 1, [{ type: side === 'n' ? 'kitchen' : 'store', v: [vF + D, vF + D + wd] }]);
          if (w) { add(w); arch(front, 2, w, 0, mid(front, (wu[0] + wu[1]) / 2, vF + D), 2.4); w.doors.push({ wall: side === 'n' ? 1 : 3, at: 0.5 }); break; } } } }
    for (const e of EDGES.filter(e => e.code === 'wall')) wallHouse(e, { depth: 5.5 });
    terrace([0, -17], 3, 2, -1, [0, -14], [0, 14], { front: [5, 7], depth: [4, 6], passage: 0.5 });
    terrace([0, -17], 3, 2, 1, [0, -14], [0, 2], { front: [5, 7], depth: [5, 7], wings: 0.5 });
  }
  // по каждому ребру с кодом «общая стена» — сплошная граничная стена (дома, если встали, к ней прислонены)
  const fences = EDGES.filter(e => e.code === 'wall').map(e => ({ line: [e.a, e.b], fence: true, onEdge: e }));
  const exits = EDGES.filter(e => e.code === 'street').map(e => e.m), half = EDGES.filter(e => e.code === 'half');
  return { variant: V, streets, half, exits, buildings, fences, seed };
}
