// Рельеф и биомы: верхний уровень, смешивание родителей, вкрапления, доля родителя, правила стыков воды.
import { SQ3, DIRS, K, toPx } from '../core/hex.js';
import { waterComponents } from '../core/graph.js';
import { BIOMES, SEA, FRESH, SHORE, INCL } from '../world/biomes.js';

export const terrainRules = {
  base: { id: 'top.base', stage: 'top', locked: true, name: 'Высота и влажность → биом', params: [
      { key: 'sea', label: 'Море ниже высоты', min: 0.2, max: 0.5, step: 0.01, value: 0.33 }, { key: 'hill', label: 'Холмы от высоты', min: 0.5, max: 0.95, step: 0.01, value: 0.76 }, { key: 'mount', label: 'Горы от высоты', min: 0.55, max: 1.2, step: 0.01, value: 0.9 }],
    apply(ctx) {
      for (const c of ctx.cells) {
        const [x, y] = toPx(c.q, c.r);
        const e = (ctx.noise(x, y, 4, 1) - 0.5) * 1.8 + 0.5;
        const m = (ctx.noise(x, y, 5, 2) - 0.5) * 1.8 + 0.5;
        c.b = e < ctx.p.sea ? SEA : e > ctx.p.mount ? 6 : e > ctx.p.hill ? 5 : m < 0.3 ? 7 : m < 0.5 ? 2 : (m > 0.75 && e < 0.45) ? 4 : 3;
        c.data[this.ns] = { высота: +e.toFixed(3), влажность: +m.toFixed(2) };
      }
    } },

  neighbors: { id: 'top.neighbors', stage: 'top', name: 'Соседи повышают шанс своего биома', params: [{ key: 'chance', label: 'Сила', min: 0, max: 0.5, step: 0.05, value: 0.25 }],
    apply(ctx) {
      const prev = new Map(ctx.cells.map(c => [c, c.b])); let n = 0;
      for (const c of ctx.cells) {
        const own = prev.get(c), cnt = new Map();
        for (const nb of ctx.nb(c)) if (nb) cnt.set(prev.get(nb), (cnt.get(prev.get(nb)) || 0) + 1);
        let best = own, bc = 0; for (const [b, k] of cnt) if (b !== own && k > bc) { best = b; bc = k; }
        if (bc >= (own === SEA ? 5 : 3) && ctx.rand(c.q, c.r) < (bc - 2) * ctx.p.chance) { c.b = best; n++; }
      }
      return { изменено: n };
    } },

  detachedWater: { id: 'top.detachedWater', stage: 'top', name: 'Вода без связи с главным океаном → озеро', params: [{ key: 'maxSize', label: 'Макс. размер', min: 1, max: 30, step: 1, value: 8 }],
    apply(ctx) {
      const comps = waterComponents(ctx.cells, c => ctx.nb(c), c => c.b === SEA);
      const main = comps.reduce((a, b) => (!a || b.cells.length > a.cells.length) ? b : a, null);
      let lakes = 0;
      for (const comp of comps) {
        if (comp === main || comp.edge || comp.cells.length > ctx.p.maxSize) continue;
        for (const c of comp.cells) { c.b = FRESH; c.data[this.ns] = { вода: 'пресная', размер: comp.cells.length }; }
        lakes++;
      }
      return { озёр: lakes };
    } },

  blend: { id: 'draft.blend', stage: 'draft', locked: true, name: 'Смешивание родителей + изгиб + шум', params: [
      { key: 'amp', label: 'Шум', min: 0, max: 1.5, step: 0.05, value: 0.4 }, { key: 'warp', label: 'Изгиб границ', min: 0, max: 16, step: 1, value: 8 }],
    apply(ctx) {
      const D = SQ3 * 10;
      for (const c of ctx.cells) {
        const wx = c.x + (ctx.noise(c.x, c.y, 10, 901) - 0.5) * 2 * ctx.p.warp, wy = c.y + (ctx.noise(c.x, c.y, 10, 902) - 0.5) * 2 * ctx.p.warp;
        const w = new Map(); let ws = 0;
        for (const P of ctx.parents) { const wi = Math.max(0, 1 - Math.hypot(wx - P.x, wy - P.y) / D); if (wi > 0) { w.set(P.b, (w.get(P.b) || 0) + wi); ws += wi; } }
        c.base = [...w].map(([b, wi]) => [b, wi / ws + ctx.p.amp * (ctx.noise(c.x, c.y, 4, b + 10) - 0.5) * 2]);
        c.b = c.base.reduce((a, b) => b[1] > a[1] ? b : a)[0];
      }
    } },

  inclusions: { id: 'draft.inclusions', stage: 'draft', name: 'Вкрапления', params: [{ key: 'max', label: 'Макс. пятен', min: 0, max: 4, step: 1, value: 2 }],
    apply(ctx) {
      const opts = INCL[ctx.dom]; if (!opts || !opts.length) return {};
      const rng = ctx.rng(ctx.Q, ctx.R), n = Math.floor(rng() * (ctx.p.max + 1)); let total = 0;
      for (let k = 0; k < n; k++) {
        const free = ctx.cells.filter(c => !c.data[this.ns]); if (!free.length) break;
        const t = opts[Math.floor(rng() * opts.length)], size = 3 + Math.floor(rng() * 13);
        const mark = c => { c.b = t; c.data[this.ns] = { t, тип: BIOMES[t][0], пятно: k }; total++; };
        const start = free[Math.floor(rng() * free.length)]; mark(start); const grown = [start];
        while (grown.length < size) {
          const front = [];
          for (const g of grown) for (const [a, b] of DIRS) { const c = ctx.byKey.get(K(g.q + a, g.r + b)); if (c && !c.data[this.ns] && !front.includes(c)) front.push(c); }
          if (!front.length) break; const c = front[Math.floor(rng() * front.length)]; mark(c); grown.push(c);
        }
      }
      return { пятен: n, клеток: total };
    } },

  quota: { id: 'draft.quota', stage: 'draft', name: 'Минимальная доля биома родителя', params: [{ key: 'share', label: 'Доля, %', min: 40, max: 80, step: 1, value: 55 }],
    apply(ctx) {
      const dom = ctx.dom, isIncl = c => !!c.data['draft.inclusions'];
      const assign = delta => { let cnt = 0; for (const c of ctx.cells) { if (!isIncl(c)) { let bb = c.b, bs = -Infinity; for (const [b, s] of c.base) { const v = s + (b === dom ? delta * c.f : 0); if (v > bs) { bs = v; bb = b; } } c.b = bb; } if (c.b === dom) cnt++; } return cnt; };
      const need = Math.ceil(ctx.p.share / 100 * ctx.cells.length); let delta = 0;
      if (assign(0) < need) { let lo = 0, hi = 4; for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (assign(mid) >= need) hi = mid; else lo = mid; } delta = hi; assign(hi); }
      return { надбавка: +delta.toFixed(3) };
    } },

  continue: { id: 'final.continue', stage: 'final', name: 'Продолжение пятен соседа через границу', params: [{ key: 'strength', label: 'Сила', min: 0, max: 1.2, step: 0.05, value: 1 }],
    apply(ctx) {
      const inc = 'draft.inclusions', P = [0.85, 0.55, 0.3].map(v => Math.min(1, v * ctx.p.strength));
      const blocked = m => m.data[this.ns] || m.data[inc] || m.data.rivers || m.data.roads; // реки/дороги не перекрываем пятнами
      let front = [], n = 0;
      for (const d of ctx.neighborDrafts) for (const c of d.cells) { const di = c.data[inc]; if (!di) continue;
        for (const [a, b] of DIRS) { const m = ctx.byKey.get(K(c.q + a, c.r + b)); if (m && !m.data[inc]) front.push([m, di.t]); } }
      for (let depth = 0; depth < P.length && front.length; depth++) {
        const next = [];
        for (const [m, t] of front) {
          if (blocked(m) || ctx.rand(m.q, m.r, t, depth) >= P[depth]) continue;
          m.b = t; m.data[this.ns] = { тип: BIOMES[t][0], глубина: depth + 1 }; n++;
          for (const [a, b] of DIRS) { const k = ctx.byKey.get(K(m.q + a, m.r + b)); if (k && !blocked(k)) next.push([k, t]); }
        }
        front = next;
      }
      return { клеток: n };
    } },

  enclosedWater: { id: 'final.enclosedWater', stage: 'final', name: 'Вода внутри гекса, не касающаяся края → озеро', params: [{ key: 'maxSize', label: 'Макс. размер', min: 1, max: 60, step: 1, value: 30 }],
    apply(ctx) {
      const comps = waterComponents(ctx.cells, c => DIRS.map(([a, b]) => ctx.byKey.get(K(c.q + a, c.r + b))), c => c.b === SEA);
      let lakes = 0;
      for (const comp of comps) {
        if (comp.edge || comp.cells.length > ctx.p.maxSize) continue; // касается края → не знаем, куда ведёт → остаётся океаном
        for (const c of comp.cells) { c.b = FRESH; c.data[this.ns] = { вода: 'пресная', размер: comp.cells.length }; }
        lakes++;
      }
      return { озёр: lakes };
    } },

  lakeShore: { id: 'final.lakeShore', stage: 'final', name: 'Пресная вода у морской → берег (кроме устьев рек)', forbids: [[FRESH, SEA]], exempt: c => !!c.data.rivers, params: [],
    // только убирает спорный биом со своей стороны и не создаёт океан → проверки по черновику соседа достаточно
    apply(ctx) {
      let n = 0;
      for (const c of ctx.cells) if (c.b === FRESH && !c.data.rivers && DIRS.some(([a, b]) => ctx.biomeAt(c.q + a, c.r + b) === SEA)) { c.b = SHORE; c.data[this.ns] = { было: 'пресная вода' }; n++; }
      return { клеток: n };
    } },
};
