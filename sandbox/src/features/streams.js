// Ручьи через границы гексов.
// Решение «через ребро P–B течёт ручей» — чистая функция ребра и клеток уровня родителя → обе стороны получают одно и то же.
// Направление — по «потенциалу» φ (вода < река < суша по высоте и шуму); у каждой клетки не больше одного выхода (к самому низкому соседу).
// Мир видится только через ctx черновика: ctx.cellAbove (клетки уровня выше), ctx.topCell (верхний уровень), ctx.memo (память мира).
import { DIRS, K, toPx, parentOf } from '../core/hex.js';
import { hash } from '../core/random.js';
import { TOP } from '../world/config.js';
import { wrap, pnoise } from '../world/topology.js';
import { isLakeOrSea } from '../world/biomes.js';
import { NS_KH, canonEdge, edgeSlot } from './linear.js';

const STREAM_WET = { 2: 0.6, 3: 1, 4: 1.5, 5: 1.2, 6: 1.5, 7: 0.05, 8: 0.3 };
function topElev(ctx, L, q, r) { for (let l = L; l < TOP; l++) [q, r] = parentOf(q, r); const t = ctx.topCell(q, r); return t && t.data['top.base'] ? t.data['top.base'].высота : 0; }
const hasRiver = c => !!(c.data.rivers && (c.data.rivers.ports || c.data.rivers.band));
function phi(ctx, L, c) {
  if (isLakeOrSea(c)) return -1; if (hasRiver(c)) return 0;
  return 0.1 + 0.6 * topElev(ctx, L, c.q, c.r) + 0.3 * pnoise(L, ...toPx(c.q, c.r), 4, NS_KH.rivers, L, 77);
}
function streamCandidate(ctx, L, A, e, rate) {
  const B = ctx.cellAbove(A.q + DIRS[e][0], A.r + DIRS[e][1]); if (!B) return null;
  if (isLakeOrSea(A) && isLakeOrSea(B)) return null;
  const ra = A.data.rivers, rb = B.data.rivers;
  if ((ra && ra.band) || (rb && rb.band) || (ra && ra.ports && rb && rb.ports)) return null;
  if ((ra && ra.ports && ra.ports.some(p => p.e === e)) || (rb && rb.ports && rb.ports.some(p => p.e === (e + 3) % 6))) return null;
  const wet = c => isLakeOrSea(c) ? 1 : (STREAM_WET[c.b] || 0), [q0, r0, ce] = canonEdge(A.q, A.r, e), [cq, cr] = wrap(L, q0, r0);
  return hash(NS_KH.rivers, L, cq, cr, ce, 555) < rate / 100 * (wet(A) + wet(B)) / 2 ? B : null;
}
function streamOut(ctx, L, U, rate) { // ребро единственного выхода ручья из U или -1
  const key = 'so' + L + ':' + wrap(L, U.q, U.r).join(':'); if (ctx.memo.has(key)) return ctx.memo.get(key);
  let best = -1;
  if (!isLakeOrSea(U) && !(U.data.rivers && U.data.rivers.ports && U.data.rivers.ports.some(p => p.io === 'out'))) {
    let bf = phi(ctx, L, U);
    for (let e = 0; e < 6; e++) { const B = streamCandidate(ctx, L, U, e, rate); if (!B) continue; const f = phi(ctx, L, B); if (f < bf) { bf = f; best = e; } }
  }
  ctx.memo.set(key, best); return best;
}
// точки стыковки ручьёв для клетки (q, r) уровня L = ctx.L (уровень над пачкой)
export function streamPorts(ctx, L, q, r, rate, size) {
  const P = ctx.cellAbove(q, r), out = []; if (!P) return out;
  for (let e = 0; e < 6; e++) {
    const B = streamCandidate(ctx, L, P, e, rate); if (!B) continue;
    const io = streamOut(ctx, L, P, rate) === e ? 'out' : streamOut(ctx, L, B, rate) === (e + 3) % 6 ? 'in' : null;
    if (io) out.push({ e, s: edgeSlot(L, q, r, e, NS_KH.rivers), size, io, ручей: true });
  }
  return out;
}
