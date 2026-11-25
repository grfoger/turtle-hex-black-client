// Дороги: сеть между поселениями на верхнем уровне (ранг по трафику), уточнение до детей, хутора и тропы.
import { DIRS, K, dirIndex } from '../core/hex.js';
import { TOP, world } from '../world/config.js';
import { dirW, distW } from '../world/topology.js';
import { BIOMES, WATER } from '../world/biomes.js';
import { LINEAR, NS_KH, edgeSlot, addPort, refineLinear, isLakeOrSea } from './linear.js';

export const roadRules = {
  top: { id: 'top.roads', ns: 'roads', stage: 'top', name: 'Дороги между городами (ранг по трафику)', params: [
      { key: 'towns', label: 'Поселений', min: 0, max: 16, step: 1, value: 8 }, { key: 'big', label: 'Доля крупных, %', min: 0, max: 100, step: 5, value: 25 }],
    apply(ctx) {
      const ROAD_TYPES = world.roadTypes;
      const kh = NS_KH.roads, pass = c => c && !WATER.has(c.b);
      const node = c => c.data[this.ns] || (c.data[this.ns] = { ports: [] });
      const towns = [];
      for (const c of ctx.cells.filter(c => pass(c) && BIOMES[c.b].towns !== false).sort((a, b) => ctx.rand(b.q, b.r, 1) - ctx.rand(a.q, a.r, 1))) {
        if (towns.length >= ctx.p.towns) break;
        if (towns.every(t => distW(TOP, [t.q, t.r], [c.q, c.r]) >= 4)) towns.push(c);
      }
      // размер поселения: 3 — город, 2 — посёлок, 1 — деревня
      const tsize = new Map(towns.map(t => { const x = ctx.rand(t.q, t.r, 2) * 100; return [t, x < ctx.p.big ? 3 : x < ctx.p.big + (100 - ctx.p.big) / 2 ? 2 : 1]; }));
      towns.sort((a, b) => tsize.get(b) - tsize.get(a)); // крупные подключаются первыми → магистраль между ними
      towns.forEach(t => { node(t).town = tsize.get(t); });
      const adj = new Map(), link = (a, b) => { for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); } };
      const onRoad = new Set(towns.slice(0, 1)); let roads = 0;
      for (const t of towns.slice(1)) {
        const dist = new Map([[t, 0]]), prev = new Map(), open = [t]; let hit = null;
        while (open.length) {
          open.sort((a, b) => dist.get(a) - dist.get(b)); const x = open.shift();
          if (onRoad.has(x)) { hit = x; break; }
          ctx.nb(x).forEach(n => { if (!pass(n)) return; const nd = dist.get(x) + (onRoad.has(n) ? 0.3 : (BIOMES[n.b].travelCost || 2));
            if (nd < (dist.has(n) ? dist.get(n) : Infinity)) { dist.set(n, nd); prev.set(n, x); if (!open.includes(n)) open.push(n); } });
        }
        if (!hit) { onRoad.add(t); continue; } // недостижимо (остров) → начало своей сети
        for (let x = hit; x !== t; x = prev.get(x)) { link(prev.get(x), x); onRoad.add(x); onRoad.add(prev.get(x)); }
        onRoad.add(t); roads++;
      }
      // трафик: каждая пара поселений, связанных сетью, добавляет size·size на все отрезки своего пути
      const ek = (a, b) => K(a.q, a.r) < K(b.q, b.r) ? K(a.q, a.r) + '|' + K(b.q, b.r) : K(b.q, b.r) + '|' + K(a.q, a.r);
      const traffic = new Map();
      towns.forEach((a, i) => {
        if (!adj.has(a)) return;
        const prev = new Map([[a, null]]), qu = [a];
        while (qu.length) { const x = qu.shift(); for (const y of adj.get(x) || []) if (!prev.has(y)) { prev.set(y, x); qu.push(y); } }
        for (const b of towns.slice(i + 1)) { if (!prev.has(b)) continue; const w = tsize.get(a) * tsize.get(b);
          for (let x = b; prev.get(x); x = prev.get(x)) { const k = ek(x, prev.get(x)); traffic.set(k, (traffic.get(k) || 0) + w); } }
      });
      // ранг: самый мелкий тип оставлен для троп нижних уровней (если типов больше одного)
      const nTop = Math.max(1, ROAD_TYPES.length - 1), tmax = Math.max(1, ...traffic.values());
      const rankOf = t => Math.min(nTop - 1, Math.floor((1 - t / tmax) * nTop));
      const counts = new Array(nTop).fill(0);
      for (const [a, set] of adj) for (const b of set) {
        if (ek(a, b) !== K(a.q, a.r) + '|' + K(b.q, b.r) && K(a.q, a.r) > K(b.q, b.r)) continue; // каждый отрезок один раз
        const t = rankOf(traffic.get(ek(a, b)) || 0), d = dirW(TOP, [a.q, a.r], [b.q, b.r]), s = edgeSlot(TOP, a.q, a.r, d, kh), w = ROAD_TYPES[t].w;
        addPort(node(a), d, s, w, 'both', t); addPort(node(b), (d + 3) % 6, s, w, 'both', t); counts[t]++;
      }
      const st = { поселений: towns.length, дорог: roads }; counts.forEach((n, t) => { st[ROAD_TYPES[t].name] = n; }); return st;
    } },

  refine: { id: 'draft.roads', ns: 'roads', stage: 'draft', name: 'Дороги родителя → цепочки / полосы детей', params: [
      { key: 'meander', label: 'Извилистость', min: 0, max: 5, step: 0.25, value: 0.75 }, { key: 'K', label: 'Порог полосы (ширина / клетка)', min: 0.2, max: 2, step: 0.1, value: 0.5 }],
    apply(ctx) { return refineLinear(ctx, LINEAR.roads, ctx.p); } },

  paths: { id: 'draft.paths', ns: 'roads', stage: 'draft', name: 'Хутора и тропы к дорогам (внутри гекса)', params: [
      { key: 'rate', label: 'Частота, %', min: 0, max: 5, step: 0.1, value: 0.8 }, { key: 'maxLen', label: 'Макс. длина, клеток', min: 3, max: 30, step: 1, value: 12 }],
    apply(ctx) {
      const ROAD_TYPES = world.roadTypes;
      if (ctx.lvl < 1 || ROAD_TYPES.length < 2) return {}; // самый мелкий тип — только внизу; на 1 м хуторов нет
      const kh = NS_KH.roads, t = ROAD_TYPES.length - 1, w = ROAD_TYPES[t].w;
      const target = c => !!(c.data.roads && (c.data.roads.ports || c.data.roads.band));
      const node = c => c.data[this.ns] || (c.data[this.ns] = { ports: [] });
      let n = 0;
      for (const c of ctx.cells) {
        const rate = BIOMES[c.b].hamletRate;
        if (target(c) || isLakeOrSea(c) || rate == null || ctx.rand(c.q, c.r) >= ctx.p.rate / 100 * rate) continue;
        const prev = new Map([[c, null]]), qu = [c]; let hit = null;
        while (qu.length && !hit) { const x = qu.shift(); for (const [a, b] of DIRS) { const y = ctx.byKey.get(K(x.q + a, x.r + b)); if (!y || prev.has(y) || isLakeOrSea(y)) continue; prev.set(y, x); if (target(y)) { hit = y; break; } qu.push(y); } }
        if (!hit) continue;
        const path = []; for (let x = hit; x; x = prev.get(x)) path.unshift(x);
        if (path.length - 1 > ctx.p.maxLen) continue;
        node(path[0]).hamlet = true;
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i], b = path[i + 1], d = dirIndex([a.q, a.r], [b.q, b.r]), s = edgeSlot(ctx.lvl, a.q, a.r, d, kh);
          addPort(node(a), d, s, w, 'both', t);
          if (!(b.data.roads && b.data.roads.band)) addPort(node(b), (d + 3) % 6, s, w, 'both', t);
        }
        n++;
      }
      return { хуторов: n };
    } },
};
