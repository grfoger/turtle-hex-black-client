// Линейные объекты (реки, дороги): общий механизм.
// Узел в клетке: data[ns] = { ports: [{e: ребро 0..5, s: слот -1|0|1, size: ширина в метрах, io: in|out|both, t?: ранг}], town? }
// или полоса: data[ns] = { band: true, size, under, segs: [{size, pts}] } — когда объект шире порога для масштаба клетки.
import { DIRS, OWNED, K, toPx, parentOf, childRound, hexDist, hexLine, dirIndex, unitDir } from '../core/hex.js';
import { hash, strHash, vnoise } from '../core/random.js';
import { wrap } from '../world/topology.js';
import { WATER, FRESH, isLakeOrSea, groundOf } from '../world/biomes.js';

export const NS_KH = { rivers: strHash('rivers'), roads: strHash('roads') };
// слот на ребре: хэш КАНОНИЧЕСКОГО ребра (владелец + своё ребро) → обе стороны получают одно и то же
export function canonEdge(q, r, e) { return OWNED.has(e) ? [q, r, e] : [q + DIRS[e][0], r + DIRS[e][1], (e + 3) % 6]; }
export function edgeSlot(lvl, q, r, e, kh) { const [q0, r0, ce] = canonEdge(q, r, e), [cq, cr] = wrap(lvl, q0, r0); return Math.floor(hash(kh, lvl, cq, cr, ce, 991) * 3) - 1; }
// точка стыковки на ребре: середина ребра ± 0.3 длины. При size=10 (родитель в координатах детей) это ровно центр ребёнка на ребре.
export function portXY(q, r, e, s, size) {
  const [cq, cr, ce] = canonEdge(q, r, e);
  const [cx, cy] = toPx(cq, cr, size), [nx, ny] = toPx(cq + DIRS[ce][0], cr + DIRS[ce][1], size);
  const len = Math.hypot(nx - cx, ny - cy), ux = (nx - cx) / len, uy = (ny - cy) / len;
  return [(cx + nx) / 2 - uy * 0.3 * size * s, (cy + ny) / 2 + ux * 0.3 * size * s];
}
export function addPort(nd, e, s, size, io, t) { const ex = nd.ports.find(p => p.e === e); if (ex) { ex.size = Math.max(ex.size, size); if (t != null) ex.t = ex.t == null ? t : Math.min(ex.t, t); return; } const p = { e, s, size, io }; if (t != null) p.t = t; nd.ports.push(p); }
function curvePts([ax, ay], [bx, by], tA, tB, amp, kh, pid, lc, idx) {
  const d = Math.hypot(bx - ax, by - ay), k = 0.35 * d + 1, nx = -(by - ay) / (d || 1), ny = (bx - ax) / (d || 1);
  const p1 = [ax + tA[0] * k, ay + tA[1] * k], p2 = [bx - tB[0] * k, by - tB[1] * k], pts = [], N = Math.max(8, Math.ceil(d * 4));
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * u * ax + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * bx;
    const y = u * u * u * ay + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * by;
    const off = amp * Math.sin(Math.PI * t) * (2 * vnoise(t * 3, idx, kh, pid, lc) - 1);
    pts.push([x + nx * off, y + ny * off]);
  }
  return pts;
}
function removeLoops(cells) {
  const res = [], idx = new Map();
  for (const c of cells) {
    const k = K(c[0], c[1]);
    if (idx.has(k)) { for (const r of res.splice(idx.get(k) + 1)) idx.delete(K(r[0], r[1])); continue; }
    idx.set(k, res.length); res.push(c);
  }
  return res;
}
function rasterize(pts) {
  const out = [];
  for (const [x, y] of pts) {
    const c = childRound(x, y), last = out[out.length - 1];
    if (last && last[0] === c[0] && last[1] === c[1]) continue;
    if (last && hexDist(last, c) > 1) for (const m of hexLine(last, c).slice(1, -1)) out.push(m);
    out.push(c);
  }
  return removeLoops(out);
}
function segDist(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[Math.min(i + 1, pts.length - 1)], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
function windowPts(pts, x, y, r) {
  let i0 = -1, i1 = -1; pts.forEach(([px, py], i) => { if (Math.hypot(px - x, py - y) <= r) { if (i0 < 0) i0 = i; i1 = i; } });
  if (i0 < 0) return [];
  return pts.slice(Math.max(0, i0 - 1), i1 + 2).map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]);
}
// Осевые кривые и цепочки клеток для узла родителя (Q,R). Всё в координатах уровня детей lc.
// Через точку стыковки кривая проходит поперёк ребра: [снаружи, на ребре, внутри] — у обоих соседей одинаково.
function buildChains(lc, Q, R, node, kh, meander, ownedFn, fixJ) {
  const [px, py] = toPx(Q, R, 10), [Qw, Rw] = wrap(lc + 1, Q, R);
  let J = childRound(px + (hash(kh, lc, Qw, Rw, 31) - 0.5) * 5, py + (hash(kh, lc, Qw, Rw, 32) - 0.5) * 5);
  if (fixJ) J = fixJ(J);
  const ports = node.ports.map(p => { const pc = childRound(...portXY(Q, R, p.e, p.s, 10)), [dq, dr] = DIRS[p.e];
    return { ...p, pc, inner: [pc[0] - dq, pc[1] - dr], outer: [pc[0] + dq, pc[1] + dr] }; });
  const ins = ports.filter(p => p.io === 'in'), out = ports.find(p => p.io === 'out'), both = ports.filter(p => p.io === 'both');
  const specs = [];
  if (both.length) { if (both.length === 2 && !node.town) specs.push([both[0], both[1], Math.max(both[0].size, both[1].size), Math.min(both[0].t ?? 99, both[1].t ?? 99)]); else both.forEach(p => specs.push([p, null, p.size, p.t])); }
  else if (out && ins.length === 1) specs.push([ins[0], out, out.size]);
  else { if (out) specs.push([null, out, out.size]); ins.forEach(p => specs.push([p, null, p.size])); }
  let fail = 0;
  const chains = specs.map(([a, b, size, t], idx) => {
    const start = a ? a.inner : J, end = b ? b.inner : J, S0 = toPx(...start), E0 = toPx(...end);
    const cl = Math.hypot(E0[0] - S0[0], E0[1] - S0[1]) || 1, cu = [(E0[0] - S0[0]) / cl, (E0[1] - S0[1]) / cl];
    const tA = a ? unitDir((a.e + 3) % 6) : cu, tB = b ? unitDir(b.e) : cu;
    const pre = a ? [a.outer, a.pc] : [], post = b ? [b.pc, b.outer] : [];
    const attempt = amp => { const pts = curvePts(S0, E0, tA, tB, amp, kh, Qw * 7919 + Rw, lc, idx); return { pts, cells: removeLoops([...pre, ...rasterize(pts), ...post]) }; };
    const ok = cells => cells.slice(pre.length, cells.length - post.length).every(c => ownedFn(c[0], c[1]));
    let r = attempt(meander);
    if (!ok(r.cells)) r = attempt(0);
    if (!ok(r.cells)) { const cells = removeLoops([...pre, ...hexLine(start, end), ...post]); r = { pts: cells.slice(pre.length, cells.length - post.length).map(c => toPx(...c)), cells }; if (!ok(cells)) fail++; }
    return { fromJ: !a, toJ: !b, cells: r.cells, size, t: t === 99 ? undefined : t, pts: [...pre.map(c => toPx(...c)), ...r.pts, ...post.map(c => toPx(...c))] };
  });
  return { chains, J, fail };
}
// Общий шаг «линия родителя → дети»: цепочки (если объект ýже порога) или полоса клеток (если шире).
// hooks.extraPorts(lc, pq, pr) — дополнительные точки стыковки своего родителя (например, ручьи через границы гексов).
export function refineLinear(ctx, ns, bandBiome, P, hooks = {}) {
  const lc = ctx.lvl, kh = NS_KH[ns], scale = Math.pow(10, lc);
  const isBand = size => size >= P.K * scale, halfW = size => size / scale; // ширина гекса = 2 единицы
  const own = (q, r) => ctx.byKey.get(K(q, r));
  const node = c => c.data[ns] || (c.data[ns] = { ports: [] });
  // ближайшая своя клетка суши (город и развилка дорог не ставятся на воду)
  const nearLand = J => { const st = own(J[0], J[1]); if (!st || !isLakeOrSea(st)) return J; const seen = new Set([st]), qu = [st];
    while (qu.length) { const x = qu.shift(); if (!isLakeOrSea(x)) return [x.q, x.r]; for (const [a, b] of DIRS) { const y = ctx.byKey.get(K(x.q + a, x.r + b)); if (y && !seen.has(y)) { seen.add(y); qu.push(y); } } } return J; };
  const segs = [], lineChains = []; let fail = 0, J = null, town = false, myNd = null;
  for (const [a, b] of [[0, 0], ...DIRS]) {
    const pq = ctx.Q + a, pr = ctx.R + b, above = ctx.cellAbove(pq, pr), mine = a === 0 && b === 0; let nd = above && above.data[ns];
    if (mine && hooks.extraPorts) { const vs = hooks.extraPorts(lc, pq, pr); if (vs.length) nd = { ...(nd || {}), ports: [...((nd && nd.ports) || []), ...vs] }; }
    if (!nd) continue;
    if (nd.ports) {
      const res = buildChains(lc, pq, pr, nd, kh, P.meander, (q, r) => { const [x, y] = parentOf(q, r); return x === pq && y === pr; }, mine && ns === 'roads' ? nearLand : null);
      if (mine) { fail = res.fail; J = res.J; town = nd.town || false; myNd = nd; }
      for (const ch of res.chains) { if (isBand(ch.size)) segs.push({ size: ch.size, pts: ch.pts, cells: mine ? ch.cells : null }); else if (mine) lineChains.push(ch); }
    }
    if (nd.segs) { const [ax, ay] = toPx(pq, pr); for (const s of nd.segs) segs.push({ size: s.size, pts: s.pts.map(([x, y]) => [(x + ax) * 10, (y + ay) * 10]) }); }
  }
  const river = ns === 'rivers', hasIo = io => !!myNd && myNd.ports.some(p => p.io === io);
  let pond = false;
  if (river && J && !WATER.has(ctx.dom) && hasIo('in') && !hasIo('out')) {
    const j = own(J[0], J[1]);
    if (j) { pond = true; for (const c of [j, ...DIRS.map(([a, b]) => own(J[0] + a, J[1] + b))]) if (c && (c === j || ctx.rand(c.q, c.r, 7) < 0.4)) { c.b = FRESH; c.data[ns] = { ports: [], ...(c.data[ns] || {}), пруд: true }; } }
  }
  // полоса: свои клетки ближе половины ширины к любой оси (своей или соседской — считается одинаково по обе стороны границы)
  const band = new Map(), put = (c, size) => band.set(c, Math.max(band.get(c) || 0, size));
  for (const s of segs) if (s.cells) for (const c of s.cells) { const m = own(c[0], c[1]); if (m && !isLakeOrSea(m)) put(m, s.size); }
  for (const c of ctx.cells) if (!isLakeOrSea(c)) for (const s of segs) if (segDist(c.x, c.y, s.pts) <= halfW(s.size)) put(c, s.size);
  for (const [c, size] of band) {
    const under = groundOf(c); c.b = bandBiome;
    const near = segs.map(s => ({ size: s.size, pts: windowPts(s.pts, c.x, c.y, halfW(s.size) + 3).map(([a, b]) => [+(a - c.x).toFixed(2), +(b - c.y).toFixed(2)]) })).filter(s => s.pts.length);
    c.data[ns] = { band: true, size, under, segs: near };
  }
  // линии: цепочки клеток, у каждой клетки — свои точки стыковки с соседями по цепочке
  const used = new Set(band.keys()), io = river ? ['out', 'in'] : ['both', 'both'];
  const wet = cc => isLakeOrSea(own(cc[0], cc[1]));
  const wetParent = WATER.has(ctx.dom) || pond;
  // путь по своим клеткам от cc до ближайшей воды (водоём), без самой cc
  const toWater = cc => { const st = own(cc[0], cc[1]); if (!st) return null; const prev = new Map([[st, null]]), qu = [st];
    while (qu.length) { const x = qu.shift(); if (isLakeOrSea(x)) { const p = []; for (let y = x; y !== st; y = prev.get(y)) p.unshift([y.q, y.r]); return p; }
      for (const [a, b] of DIRS) { const y = ctx.byKey.get(K(x.q + a, x.r + b)); if (y && !prev.has(y)) { prev.set(y, x); qu.push(y); } } } return null; };
  for (const ch of lineChains) {
    let cells = ch.cells;
    if (river && wetParent && ch.toJ && !hasIo('out')) { // река здесь кончается → в первую воду по пути, иначе до ближайшей воды от центра
      const i = cells.findIndex(wet); if (i >= 0) cells = cells.slice(0, i + 1); else { const p = toWater(cells[cells.length - 1]); if (p) cells = [...cells, ...p]; } }
    if (river && wetParent && ch.fromJ && !hasIo('in')) { // сток из водоёма → от последней воды по пути
      const i = cells.map(wet).lastIndexOf(true); if (i >= 0) cells = cells.slice(i); else { const p = toWater(cells[0]); if (p) cells = [...p.reverse(), ...cells]; } }
    let prev = null;
    for (const cc of cells) {
      const cur = own(cc[0], cc[1]);
      if (prev) {
        const d = dirIndex(prev, cc);
        if (d >= 0 && !(river && wet(prev) && wet(cc))) { // по воде река линией не идёт
          const s = edgeSlot(lc, prev[0], prev[1], d, kh), pa = own(prev[0], prev[1]);
          if (pa && !band.has(pa)) addPort(node(pa), d, s, ch.size, io[0], ch.t);
          if (cur && !band.has(cur)) addPort(node(cur), (d + 3) % 6, s, ch.size, io[1], ch.t);
        }
        if (cur && used.has(cur)) break; // влились в уже проложенную ветку или полосу
      }
      if (cur) used.add(cur);
      prev = cc;
    }
  }
  if (river && J && hasIo('out') && !hasIo('in') && myNd.ports.every(p => p.ручей)) { const j = own(J[0], J[1]); if (j && !isLakeOrSea(j)) node(j).spring = true; }
  if (town && J) { const j = own(J[0], J[1]); if (j && !band.has(j)) node(j).town = town; }
  const st = { ветвей: lineChains.length, 'клеток полосы': band.size }; if (fail) st['ошибок трассировки'] = fail; return st;
}
