// Реки: верхний уровень (стекание по высоте, озёра и их сток), уточнение до детей, родники и ручьи внутри гекса.
import { DIRS, K, dirIndex } from '../core/hex.js';
import { waterComponents } from '../core/graph.js';
import { TOP } from '../world/config.js';
import { BIOMES, WATER, FRESH } from '../world/biomes.js';
import { LINEAR, NS_KH, edgeSlot, addPort, refineLinear } from './linear.js';
import { streamPorts } from './streams.js';

export const riverRules = {
  top: { id: 'top.rivers', ns: 'rivers', stage: 'top', name: 'Реки: стекание по высоте, сток из озёр', params: [
      { key: 'sources', label: 'Истоков, %', min: 0, max: 40, step: 1, value: 15 }, { key: 'k', label: 'Ширина на ед. расхода, м', min: 5, max: 300, step: 5, value: 60 },
      { key: 'dry', label: 'Бессточные озёра при влажности <', min: 0, max: 1, step: 0.05, value: 0.3 }, { key: 'grow', label: 'Разлив озера до выхода, клеток', min: 0, max: 20, step: 1, value: 6 }],
    apply(ctx) {
      const kh = NS_KH.rivers, water = c => c && WATER.has(c.b);
      const elev = c => !c ? -1 : water(c) ? -0.5 : (c.data['top.base'] ? c.data['top.base'].высота : 0.5); // край карты < вода < суша
      const down = new Map(); let pits = 0, drained = 0, endorheic = 0, grown = 0;
      // стекание от start по самому крутому спуску; клетки excl (своё озеро) не рассматриваются
      const trace = (start, excl) => {
        const added = [], madeLakes = []; let cur = start;
        while (cur && !water(cur) && !down.has(cur)) {
          let best = null, bd = -1, be = elev(cur);
          ctx.nb(cur).forEach((n, d) => { if (n && excl && excl.has(n)) return; const e = elev(n); if (e < be) { be = e; best = n; bd = d; } });
          if (bd < 0) { if (cur !== start || excl) { madeLakes.push([cur, cur.b]); cur.b = FRESH; pits++; } break; } // яма → озеро
          down.set(cur, { d: bd, next: best }); added.push(cur); cur = best;
        }
        return { added, madeLakes };
      };
      const sources = ctx.cells.filter(c => !water(c) && elev(c) > 0.5 && ctx.rand(c.q, c.r) < ctx.p.sources / 100).sort((a, b) => elev(b) - elev(a));
      for (const s of sources) trace(s);
      // сток: озеро, в которое что-то втекает, разливается до самой низкой точки берега, откуда есть куда течь
      const exitOf = new Map(), done = new Set(), moist = c => c.data['top.base'] ? c.data['top.base'].влажность : 0.5;
      const target = c => exitOf.get(c) || c;
      const reaches = (from, lake) => { const seen = new Set(); for (let x = from; x && !seen.has(x); ) { seen.add(x); if (lake.has(x)) return true; const dn = down.get(target(x)); if (!dn) return false; x = dn.next; } return false; };
      for (let iter = 0; iter < 60; iter++) {
        const inflow = new Set([...down.values()].map(v => v.next).filter(Boolean));
        const comp = waterComponents(ctx.cells, c => ctx.nb(c), c => c.b === FRESH).find(cp => !cp.cells.some(c => done.has(c)) && cp.cells.some(c => inflow.has(c)));
        if (!comp) break;
        const lake = new Set(comp.cells); comp.cells.forEach(c => done.add(c));
        if (comp.cells.reduce((a, c) => a + moist(c), 0) / comp.cells.length < ctx.p.dry) { endorheic++; continue; }
        const tried = new Set(); let ok = false, g = 0;
        while (!ok) {
          const shore = [...new Set([...lake].flatMap(c => ctx.nb(c)).filter(n => n && !lake.has(n) && !water(n) && !tried.has(n)))].sort((a, b) => elev(a) - elev(b));
          const o = shore[0]; if (!o) break;
          const free = ctx.nb(o).some(n => !(n && lake.has(n)) && (!n || water(n) || elev(n) < elev(o)));
          if (!free) { if (g++ >= ctx.p.grow) break; o.b = FRESH; down.delete(o); lake.add(o); done.add(o); grown++; continue; } // разлив
          const L = ctx.nb(o).filter(n => n && lake.has(n)).sort((a, b) => elev(a) - elev(b))[0];
          const t = trace(o, lake);
          if (reaches(o, lake)) { t.added.forEach(c => down.delete(c)); t.madeLakes.forEach(([c, b]) => { c.b = b; pits--; }); tried.add(o); continue; }
          down.set(L, { d: ctx.nb(L).indexOf(o), next: o }); for (const c of lake) if (c !== L) exitOf.set(c, L);
          ok = true; drained++;
        }
        if (!ok) endorheic++;
      }
      // расход: по графу стока (впадение в проточное озеро засчитывается его выходу)
      const nodes = [...down.keys()], indeg = new Map(nodes.map(c => [c, 0])), flow = new Map(nodes.map(c => [c, 1]));
      for (const c of nodes) { const t = target(down.get(c).next); if (indeg.has(t)) indeg.set(t, indeg.get(t) + 1); }
      const qu = nodes.filter(c => !indeg.get(c));
      while (qu.length) { const c = qu.shift(), t = target(down.get(c).next); if (!indeg.has(t)) continue; flow.set(t, flow.get(t) + flow.get(c)); indeg.set(t, indeg.get(t) - 1); if (!indeg.get(t)) qu.push(t); }
      const node = c => c.data[this.ns] || (c.data[this.ns] = { ports: [] });
      for (const c of nodes) {
        const { d, next } = down.get(c), s = edgeSlot(TOP, c.q, c.r, d, kh), size = Math.round(ctx.p.k * Math.pow(flow.get(c), 1.2));
        addPort(node(c), d, s, size, 'out');
        if (next) addPort(node(next), (d + 3) % 6, s, size, 'in'); // в т.ч. водоём-приёмник: там река заканчивается
      }
      return { истоков: sources.length, 'клеток с рекой': nodes.length, 'ям → озёр': pits, 'проточных озёр': drained, 'бессточных': endorheic, 'клеток разлива': grown };
    } },

  refine: { id: 'draft.rivers', ns: 'rivers', stage: 'draft', name: 'Реки родителя → цепочки / полосы детей', params: [
      { key: 'meander', label: 'Извилистость', min: 0, max: 5, step: 0.25, value: 2.5 }, { key: 'K', label: 'Порог полосы (ширина / клетка)', min: 0.2, max: 2, step: 0.1, value: 0.5 },
      { key: 'streams', label: 'Ручьи через границы гексов, %', min: 0, max: 80, step: 5, value: 30 }],
    apply(ctx) {
      // ширина ручья, пересекающего границы гексов, — по масштабу детей
      const extraPorts = (lc, pq, pr) => { const SS = { 4: 100, 3: 20, 2: 4, 1: 1 }[lc]; return ctx.p.streams && SS ? streamPorts(ctx, lc + 1, pq, pr, ctx.p.streams, SS) : []; };
      return refineLinear(ctx, LINEAR.rivers, ctx.p, { extraPorts });
    } },

  springs: { id: 'draft.springs', ns: 'rivers', stage: 'draft', name: 'Родники и ручьи (внутри гекса)', params: [
      { key: 'rate', label: 'Частота, %', min: 0, max: 5, step: 0.1, value: 1 }, { key: 'maxLen', label: 'Макс. длина, клеток', min: 3, max: 30, step: 1, value: 15 }],
    apply(ctx) {
      const size = { 3: 20, 2: 4, 1: 1 }[ctx.lvl]; if (!size) return {}; // ручьи «своего» масштаба; на 1 м не появляются
      const kh = NS_KH.rivers;
      const water = c => WATER.has(c.b), target = c => water(c) || !!(c.data.rivers && (c.data.rivers.ports || c.data.rivers.band));
      const node = c => c.data[this.ns] || (c.data[this.ns] = { ports: [] });
      let n = 0;
      for (const c of ctx.cells) {
        const wet = BIOMES[c.b].wetness;
        if (target(c) || wet == null || ctx.rand(c.q, c.r) >= ctx.p.rate / 100 * wet) continue;
        const prev = new Map([[c, null]]), qu = [c]; let hit = null;
        while (qu.length && !hit) { const x = qu.shift(); for (const [a, b] of DIRS) { const y = ctx.byKey.get(K(x.q + a, x.r + b)); if (!y || prev.has(y)) continue; prev.set(y, x); if (target(y)) { hit = y; break; } qu.push(y); } }
        if (!hit) continue;
        const path = []; for (let x = hit; x; x = prev.get(x)) path.unshift(x);
        if (path.length - 1 > ctx.p.maxLen) continue;
        node(path[0]).spring = true;
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i], b = path[i + 1], d = dirIndex([a.q, a.r], [b.q, b.r]), s = edgeSlot(ctx.lvl, a.q, a.r, d, kh);
          addPort(node(a), d, s, size, 'out');
          if (!(b.data.rivers && b.data.rivers.band)) addPort(node(b), (d + 3) % 6, s, size, 'in'); // впадает в реку или водоём
        }
        n++;
      }
      return { родников: n };
    } },
};
