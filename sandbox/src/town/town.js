// Сборка города из кварталов 100 м. Чистые функции: квартал зависит только от (сид, параметры города, свои координаты).
// Порядок: районы (по координатам) → улицы на рёбрах (каждое ребро решает само) → начинка квартала (модуль или шаблон).
import { DIRS, K, hexDist, dirIndex, childRound } from '../core/hex.js';
import { hash, rngFrom, strHash } from '../core/random.js';
import { portXY, canonEdge } from '../features/linear.js';
import { CELL, isPass, INTERIOR, isInterior, EDGE, EDGE_NB, variant, MODULE, DISTRICTS } from './modules.js';

const NS = strHash('town');
export const town = { R: 4 }; // радиус города в кварталах

export const inTown = (Q, R) => hexDist([Q, R], [0, 0]) <= town.R;
// квартал на одной из 6 главных осей (или центр)
const onAxis = (Q, R, j) => { const [a, b] = DIRS[j]; const t = a ? Q / a : R / b; return t >= 0 && Number.isInteger(t) && t * a === Q && t * b === R; };

export function districtOf(Q, R) {
  if (!inTown(Q, R)) return null;
  const d = hexDist([Q, R], [0, 0]);
  if (d === 0) return town.R >= 1 ? 'market' : 'tavern';
  if (d === 1) {
    const i = dirIndex([0, 0], [Q, R]), th = Math.floor(hash(NS, 1) * 6), tp = (th + 2 + Math.floor(hash(NS, 2) * 3)) % 6;
    if (i === th) return 'townhall'; if (i === tp) return 'temple';
  }
  if (d >= 2 && DIRS.some((_, j) => onAxis(Q, R, j)) && hash(NS, 3, Q, R) < 0.3) return 'tavern';
  const x = d / town.R + (hash(NS, 4, Q, R) - 0.5) * 0.35;
  return x < 0.4 ? 'rich' : x < 0.75 ? 'middle' : 'poor';
}

// ребро «к центру» квартала: гарантированная улица → весь город связан
function toward(Q, R) {
  const d = hexDist([Q, R], [0, 0]); if (!d) return -1;
  const c = DIRS.map((v, j) => j).filter(j => hexDist([Q + DIRS[j][0], R + DIRS[j][1]], [0, 0]) < d);
  return c[Math.floor(hash(NS, 5, Q, R) * c.length)];
}

// улицы на ребре: { слот: '=' главная | '.' обычная }. Решает само ребро по своей каноничной записи → одинаково с обеих сторон.
export function edgeStreets(Q, R, e) {
  const [q0, r0, ce] = canonEdge(Q, R, e), q1 = q0 + DIRS[ce][0], r1 = r0 + DIRS[ce][1];
  const A = districtOf(q0, r0), B = districtOf(q1, r1), res = {};
  if (!A && !B) return res;
  // главные улицы — по 6 осям от центра, выходят из города воротами
  if (onAxis(q0, r0, ce) || onAxis(q0, r0, (ce + 3) % 6)) { res[0] = '='; return res; }
  if (!A || !B) return res; // граница города без ворот → стена
  const h = (...n) => hash(NS, 10, q0, r0, ce, ...n);
  const p = (toward(q0, r0) === ce || toward(q1, r1) === (ce + 3) % 6) ? 1 : (DISTRICTS[A].density + DISTRICTS[B].density) / 2;
  if (h(1) < p) {
    const s = Math.floor(h(2) * 3) - 1; res[s] = '.';
    if (h(3) < 0.15) res[s === 0 ? (h(4) < 0.5 ? -1 : 1) : -s] = '.';
  }
  return res;
}
// что стоит на клетке грани без улицы: стена на краю города, иначе — дом или двор района-хозяина ребра
function edgeFill(Q, R, e, s) {
  const [q0, r0, ce] = canonEdge(Q, R, e), A = districtOf(q0, r0), B = districtOf(q0 + DIRS[ce][0], r0 + DIRS[ce][1]);
  if (!A || !B) return 'W';
  const D = DISTRICTS[A]; return hash(NS, 11, q0, r0, ce, s) < 0.6 ? (D.fill || 'h') : 'g';
}

// кратчайший путь по внутренним клеткам квартала (Дейкстра на 91 клетке — дёшево)
function dijkstra(src, cost) {
  const dist = new Map(src.map(k => [k, 0])), prev = new Map(), open = [...src];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0], [q, r] = cur.split(',').map(Number), dc = dist.get(cur);
    for (const [a, b] of DIRS) {
      const nq = q + a, nr = r + b; if (!isInterior(nq, nr)) continue;
      const nk = K(nq, nr), nd = dc + cost(nk); if (nd < (dist.has(nk) ? dist.get(nk) : Infinity)) { if (!dist.has(nk)) open.push(nk); dist.set(nk, nd); prev.set(nk, cur); }
    }
  }
  return { dist, prev };
}
const pathTo = (prev, k) => { const p = []; while (k !== undefined) { p.push(k); k = prev.get(k); } return p; };
const best = (list, f) => list.reduce((a, b) => f(b) < f(a) ? b : a);

// ---- квартал ----
export function buildQuarter(Q, R) {
  const dist = districtOf(Q, R); if (!dist) return null;
  const D = DISTRICTS[dist], rng = rngFrom(NS, 20, Q, R), cells = new Map(); // локальные клетки: ключ → тип
  // 1) клетки на гранях: улица, если её решило ребро
  const want = DIRS.map((_, e) => edgeStreets(Q, R, e)), ports = [];
  DIRS.forEach((_, e) => [-1, 0, 1].forEach((s, i) => {
    const [q, r] = EDGE[e][i], t = want[e][s];
    cells.set(K(q, r), t || edgeFill(Q, R, e, s));
    if (t) ports.push({ e, i, t, key: K(q, r), nb: EDGE_NB[e][i].map(([a, b]) => K(a, b)) });
  }));
  let info = { district: dist, ports: ports.length, fixes: 0, deadEnds: 0 };
  if (D.modules) info = Object.assign(info, fromModule(Q, R, D, cells, ports));
  else fromTemplate(D, rng, cells, ports);
  groupBuildings(Q, R, rng, cells);
  return { Q, R, cells, info };
}

// особый район: ручной модуль, поворот/отражение под улицы рёбер, затем доводка недостающих выходов
function fromModule(Q, R, D, cells, ports) {
  const portSet = new Set(ports.map(p => p.e + ':' + p.i));
  let top = null; const start = Math.floor(hash(NS, 21, Q, R) * 12 * D.modules.length);
  for (let n = 0; n < 12 * D.modules.length; n++) {
    const v = (start + n) % (12 * D.modules.length), mod = MODULE[D.modules[Math.floor(v / 12)]], k = v % 6, m = (v >> 0) % 12 >= 6 ? 1 : 0;
    const map = variant(mod, k, m); let score = 0;
    DIRS.forEach((_, e) => EDGE_NB[e].forEach((nb, i) => {
      const has = nb.some(([a, b]) => isPass(map.get(K(a, b)))), w = portSet.has(e + ':' + i);
      score += w && has ? 2 : w ? -3 : has ? -1 : 0;
    }));
    if (!top || score > top.score) top = { mod, k, m, map, score };
  }
  for (const [key, t] of top.map) cells.set(key, t);
  // недостающий выход: прокладываем улицу от грани к ближайшей проходимой клетке модуля
  let fixes = 0;
  const cost = k => { const t = cells.get(k); return isPass(t) ? 0 : t === 'g' ? 1 : CELL[t] && CELL[t].whole ? 60 : 4; };
  for (const p of ports) {
    if (p.nb.some(k => isPass(cells.get(k)))) continue;
    const { dist, prev } = dijkstra([p.key], cost); // от клетки на грани внутрь квартала
    const target = best([...dist.keys()].filter(k => isPass(cells.get(k))), k => dist.get(k));
    for (const k of pathTo(prev, target)) if (!isPass(cells.get(k))) cells.set(k, p.t === '=' ? '=' : '.');
    fixes++;
  }
  fixes += connectStreets(cells, cost);
  // выходы модуля без улицы на ребре — тупики (оставляем как есть)
  let deadEnds = 0;
  DIRS.forEach((_, e) => EDGE_NB[e].forEach((nb, i) => { if (!portSet.has(e + ':' + i) && nb.some(([a, b]) => isPass(cells.get(K(a, b))))) deadEnds++; }));
  return { module: top.mod.name, rotation: top.k * 60, mirror: !!top.m, score: top.score, fixes, deadEnds };
}

// уличная сеть квартала должна быть связной: обрывки пришиваем к самому большому куску
function connectStreets(cells, cost) {
  const passKeys = [...cells.keys()].filter(k => isPass(cells.get(k))), comp = new Map(); let n = 0;
  for (const s of passKeys) {
    if (comp.has(s)) continue; const st = [s]; comp.set(s, n);
    while (st.length) { const [q, r] = st.pop().split(',').map(Number); for (const [a, b] of DIRS) { const k = K(q + a, r + b); if (cells.has(k) && isPass(cells.get(k)) && !comp.has(k)) { comp.set(k, n); st.push(k); } } }
    n++;
  }
  if (n < 2) return 0;
  const size = Array(n).fill(0); for (const c of comp.values()) size[c]++;
  const main = size.indexOf(Math.max(...size)); let added = 0;
  for (let c = 0; c < n; c++) {
    if (c === main) continue;
    const src = passKeys.filter(k => comp.get(k) === c), { dist, prev } = dijkstra(src, cost);
    const goal = [...dist.keys()].filter(k => isPass(cells.get(k)) && comp.get(k) === main); if (!goal.length) continue;
    for (const k of pathTo(prev, best(goal, k => dist.get(k)))) if (!isPass(cells.get(k))) { cells.set(k, '.'); comp.set(k, main); }
    for (const k of src) comp.set(k, main); added++;
  }
  return added;
}

// обычный район: улицы от выходов к «центру» квартала, переулки, дома вдоль улиц, дворы в глубине
function fromTemplate(D, rng, cells, ports) {
  const near = INTERIOR.filter(([q, r]) => hexDist([q, r], [0, 0]) <= 1), [hq, hr] = near[Math.floor(rng() * near.length)];
  const jit = new Map(INTERIOR.map(([q, r]) => [K(q, r), 1 + rng() * D.jitter]));
  const { prev, dist } = dijkstra([K(hq, hr)], k => jit.get(k));
  // главные выходы первыми, чтобы главная улица дошла до центра квартала
  for (const p of [...ports].sort((a, b) => (b.t === '=') - (a.t === '='))) {
    const from = best(p.nb, k => dist.get(k));
    for (const k of pathTo(prev, from)) if (cells.get(k) !== '=') cells.set(k, p.t === '=' ? '=' : '.');
  }
  if (!ports.length) cells.set(K(hq, hr), 'o');
  // переулки: от далёкой от улиц клетки к ближайшей улице
  for (let a = 0; a < D.alleys; a++) {
    const streets = INTERIOR.map(([q, r]) => K(q, r)).filter(k => isPass(cells.get(k)));
    if (!streets.length) break;
    const far = dijkstra(streets, () => 1).dist, cand = [...far].filter(([, d]) => d >= 3).map(([k]) => k);
    if (!cand.length) break;
    const st = cand[Math.floor(rng() * cand.length)], { prev: pv, dist: dd } = dijkstra([st], k => jit.get(k));
    const goal = best(streets, k => dd.get(k));
    for (const k of pathTo(pv, goal)) if (!isPass(cells.get(k))) cells.set(k, ',');
  }
  // застройка: вдоль улиц — front, в глубине — back
  for (const [q, r] of INTERIOR) {
    const k = K(q, r); if (cells.get(k)) continue;
    const front = DIRS.some(([a, b]) => isPass(cells.get(K(q + a, r + b))));
    const [t, p, alt] = front ? D.front : D.back;
    cells.set(k, rng() < p ? t : alt);
  }
}

// дома: соседние клетки одного типа объединяются в здания (ратуша/храм/таверна — целиком, дома — по 1..max)
function groupBuildings(Q, R, rng, cells) {
  const bid = new Map(); let n = 0;
  for (const [q, r] of INTERIOR) {
    const k = K(q, r), t = cells.get(k), C = CELL[t]; if (!C.building || bid.has(k)) continue;
    const id = Q + ',' + R + ':' + (n++), size = C.whole ? Infinity : 1 + Math.floor(rng() * C.max), stack = [k];
    let cnt = 0;
    while (stack.length && cnt < size) {
      const c = stack.shift(); if (bid.has(c)) continue; bid.set(c, id); cnt++;
      const [cq, cr] = c.split(',').map(Number);
      for (const [a, b] of DIRS) { const nk = K(cq + a, cr + b); if (isInterior(cq + a, cr + b) && cells.get(nk) === t && !bid.has(nk)) stack.push(nk); }
    }
  }
  cells.bid = bid;
}

// ---- весь город: клетки в общих координатах детей ----
export function buildTown() {
  const quarters = [], all = new Map();
  for (let Q = -town.R; Q <= town.R; Q++) for (let R = -town.R; R <= town.R; R++) {
    const qt = buildQuarter(Q, R); if (!qt) continue; quarters.push(qt);
    for (const [k, t] of qt.cells) {
      const [q, r] = k.split(',').map(Number), gk = K(10 * Q + q, 10 * R + r);
      const b = qt.cells.bid.get(k);
      if (!all.has(gk) || isInterior(q, r)) all.set(gk, { q: 10 * Q + q, r: 10 * R + r, t, b: b || (CELL[t].building ? 'e' + gk : null), Q, R });
    }
  }
  return { quarters, cells: all, check: checkTown(quarters, all) };
}

// проверки: стыки рёбер совпадают с обеих сторон, все улицы связаны
function checkTown(quarters, all) {
  let seam = 0;
  for (const qt of quarters) for (let e = 0; e < 6; e++) [-1, 0, 1].forEach((s, i) => {
    const [q, r] = EDGE[e][i], t = qt.cells.get(K(q, r)), g = all.get(K(10 * qt.Q + q, 10 * qt.R + r));
    if (g.t !== t) seam++;
  });
  const pass = [...all.values()].filter(c => isPass(c.t)), seen = new Set();
  if (pass.length) {
    const st = [K(pass[0].q, pass[0].r)]; seen.add(st[0]);
    while (st.length) { const [q, r] = st.pop().split(',').map(Number); for (const [a, b] of DIRS) { const k = K(q + a, r + b), c = all.get(k); if (c && isPass(c.t) && !seen.has(k)) { seen.add(k); st.push(k); } } }
  }
  const fixes = quarters.reduce((a, q) => a + q.info.fixes, 0), deadEnds = quarters.reduce((a, q) => a + q.info.deadEnds, 0);
  return { quarters: quarters.length, seam, streets: pass.length, cut: pass.length - seen.size, fixes, deadEnds };
}
