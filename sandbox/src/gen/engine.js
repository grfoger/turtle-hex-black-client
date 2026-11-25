// Движок генерации: этапы конвейера, пачки детей (черновик → итог), кэш, мир-тор.
// Ничего не знает о конкретных правилах и правках: список правил и «наложение правок» подключаются снаружи.
// Каждый тайл — функция (сид, рецепт, адрес); кэш только ускоряет и может быть очищен в любой момент.
import { DIRS, K, toPx, hexNorm, parentOf, CHILD_OFFSETS, RING2 } from '../core/hex.js';
import { hash, rngFrom } from '../core/random.js';
import { TOP, world } from '../world/config.js';
import { wrap, pnoise } from '../world/topology.js';
import { SEA, groundOf } from '../world/biomes.js';

let RULES = [], overlay = (lvl, c) => c;
export const setRules = list => { RULES = list; };
export const getRules = () => RULES;
// overlay(lvl, cell) → клетка с наложенными правками (генератор видит родителя уже исправленным)
export const setOverlay = fn => { overlay = fn; };

const cache = new Map();
export const resetCache = () => cache.clear();
// открывали ли уже детей клетки (L, Q, R): их не пересчитываем
export const isOpened = (L, Q, R) => cache.has('d' + L + ':' + wrap(L, Q, R).join(':'));

export function runStage(stage, base) {
  const stats = {};
  for (const r of RULES) {
    if (r.stage !== stage || !(r.enabled || r.locked)) continue;
    const ctx = Object.assign({}, base, {
      p: r.values,
      rand: (...n) => hash(r.h, base.lvl, ...n),
      rng: (...n) => rngFrom(r.h, base.lvl, ...n),
      noise: (x, y, sz, t) => pnoise(base.lvl, x, y, sz, r.h, base.lvl, t), // x, y — позиция на уровне, sz — размер пятен в клетках
    });
    stats[r.id] = r.apply(ctx) || {};
  }
  return stats;
}
const deepFreeze = c => { for (const v of Object.values(c.data)) Object.freeze(v); Object.freeze(c.data); return Object.freeze(c); };

// ---- верхний уровень: тор N×N, генерируется целиком ----
let topCells = [], topByKey = new Map(), topStats = {};
export const getTopCells = () => topCells;
export const getTopStats = () => topStats;
export function generateTop() {
  topCells = [];
  for (let r = 0; r < world.N; r++) for (let q = 0; q < world.N; q++) topCells.push({ q, r, col: q, row: r, b: SEA, data: {} });
  topByKey = new Map(topCells.map(c => [K(c.q, c.r), c]));
  topStats = runStage('top', { lvl: TOP, cells: topCells, byKey: topByKey, nb: c => DIRS.map(([a, b]) => topByKey.get(K(...wrap(TOP, c.q + a, c.r + b)))) });
}

// ---- пачки: считаются в каноничных координатах; запрос из «соседней копии» мира получает сдвинутую копию ----
function shifted(v, dq, dr) {
  if (!dq && !dr) return v;
  const cells = v.cells.map(c => { const q = c.q + dq, r = c.r + dr, [x, y] = toPx(q, r); return { ...c, q, r, x, y }; });
  return { ...v, cells, byKey: new Map(cells.map(c => [K(c.q, c.r), c])) };
}
function viewOf(prefix, fn, L, Q, R) {
  const [Qc, Rc] = wrap(L, Q, R);
  const key = prefix + 'v' + L + ':' + Q + ':' + R; if (cache.has(key)) return cache.get(key);
  const v = shifted(fn(L, Qc, Rc), 10 * (Q - Qc), 10 * (R - Rc)); cache.set(key, v); return v;
}
export function getCell(L, q, r) {
  if (L === TOP) { const [qc, rc] = wrap(TOP, q, r), c = topByKey.get(K(qc, rc)); return c ? overlay(TOP, qc === q && rc === r ? c : { ...c, q, r }) : null; }
  const [Q, R] = parentOf(q, r);
  return overlay(L, getBatch(L + 1, Q, R).byKey.get(K(q, r)));
}
const getBiome = (L, q, r) => { const c = getCell(L, q, r); return c ? c.b : SEA; };
// черновик пачки детей клетки (L, Q, R): видит только уровень выше
export function getDraft(L, Q, R) {
  if (wrap(L, Q, R).join() !== Q + ',' + R) return viewOf('d', getDraft, L, Q, R);
  const key = 'd' + L + ':' + Q + ':' + R; if (cache.has(key)) return cache.get(key);
  const dom = groundOf(getCell(L, Q, R)), [px, py] = toPx(Q, R, 10);
  const parents = RING2.map(([a, b]) => { const [x, y] = toPx(Q + a, R + b, 10); return { b: groundOf(getCell(L, Q + a, R + b)), x, y }; });
  const cells = CHILD_OFFSETS.map(([dq, dr], idx) => {
    const q = 10 * Q + dq, r = 10 * R + dr, [x, y] = toPx(q, r);
    return { q, r, idx, x, y, f: Math.max(0, 1 - hexNorm(x - px, y - py, 10)), b: -1, data: {} };
  });
  const byKey = new Map(cells.map(c => [K(c.q, c.r), c]));
  const stats = runStage('draft', { lvl: L - 1, L, Q, R, dom, parents, cells, byKey,
    cellAbove: (q, r) => getCell(L, q, r),          // клетка уровня выше
    topCell: (q, r) => topByKey.get(K(q, r)),        // клетка верхнего уровня (каноничные координаты)
    memo: cache });                                  // память мира для общих вычислений правил (детерминированных)
  cells.forEach(deepFreeze);
  const draft = { cells, byKey, dom, stats }; cache.set(key, draft); return draft;
}
// итог пачки: черновик + правила этапа final, которые читают черновики 6 соседей
export function getBatch(L, Q, R) {
  if (wrap(L, Q, R).join() !== Q + ',' + R) return viewOf('b', getBatch, L, Q, R);
  const key = L + ':' + Q + ':' + R; if (cache.has(key)) return cache.get(key);
  const draft = getDraft(L, Q, R);
  const cells = draft.cells.map(c => ({ ...c, data: { ...c.data } }));
  const byKey = new Map(cells.map(c => [K(c.q, c.r), c]));
  const neighborDrafts = DIRS.map(([a, b]) => getDraft(L, Q + a, R + b));
  const biomeAt = (q, r) => { const m = byKey.get(K(q, r)); if (m) return m.b; for (const d of neighborDrafts) { const o = d.byKey.get(K(q, r)); if (o) return o.b; } return null; };
  const stats = runStage('final', { lvl: L - 1, L, Q, R, dom: draft.dom, cells, byKey, neighborDrafts, biomeAt });
  const shares = new Map(); for (const c of cells) shares.set(c.b, (shares.get(c.b) || 0) + 1);
  const batch = { cells, byKey, dom: draft.dom, shares, stats: { ...draft.stats, ...stats } };
  cache.set(key, batch); return batch;
}
