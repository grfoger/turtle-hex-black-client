// Слой правок мастера поверх сгенерированного мира.
// 'lvl:q:r' → { roads: { [ребро]: тип | null } }. Правка ребра пишется в обе клетки — у каждого тайла свои данные.
// Движок видит клетки уровня выше уже с правками (applyEdits подключается как overlay) → ещё не открытые дети строятся из исправленного родителя.
import { DIRS, dirIndex } from '../core/hex.js';
import { world } from '../world/config.js';
import { wrap } from '../world/topology.js';
import { NS_KH, edgeSlot } from '../features/linear.js';
import { isOpened } from './engine.js';

export const EDITS = new Map();
const EK = (lvl, q, r) => lvl + ':' + q + ':' + r;
export function applyEdits(lvl, c) {
  if (!c) return c; const ed = EDITS.get(EK(lvl, ...wrap(lvl, c.q, c.r))); if (!ed || !ed.roads) return c;
  const base = c.data.roads; if (base && base.band) return c;
  const ports = (base && base.ports ? base.ports : []).filter(p => !(p.e in ed.roads));
  for (const [e, t] of Object.entries(ed.roads)) if (t != null) ports.push({ e: +e, s: edgeSlot(lvl, c.q, c.r, +e, NS_KH.roads), size: world.roadTypes[t].w, io: 'both', t, правка: true });
  return { ...c, data: { ...c.data, roads: { ...(base || {}), ports } } };
}
// можно ли править: внутри клетки и её соседей ещё ничего не открыто (их детей не пересчитываем)
const childrenOpened = (lvl, c) => [[0, 0], ...DIRS].some(([a, b]) => isOpened(lvl, c.q + a, c.r + b));
export function editRoad(lvl, a, b, t) {
  const d = dirIndex([a.q, a.r], [b.q, b.r]); if (d < 0) return 'клетки не соседние';
  if (childrenOpened(lvl, a) || childrenOpened(lvl, b)) return 'внутри этих клеток уже открывали — уже сгенерированное не меняем';
  if ([a, b].some(c => c.data.roads && c.data.roads.band)) return 'здесь дорога полосой — её правят уровнем выше';
  for (const [c, e] of [[a, d], [b, (d + 3) % 6]]) { const k = EK(lvl, ...wrap(lvl, c.q, c.r)), ed = EDITS.get(k) || { roads: {} }; ed.roads[e] = t; EDITS.set(k, ed); }
  return t == null ? 'отрезок дороги удалён' : 'проложен отрезок: ' + world.roadTypes[t].name;
}
