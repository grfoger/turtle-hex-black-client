// Проверки, общие для всех правил: запрещённые соседства (forbids правил) и непрерывность рек/дорог на стыках.
import { DIRS, K } from '../core/hex.js';
import { setSeed, getSeed } from '../core/random.js';
import { TOP, world } from '../world/config.js';
import { getRules, resetCache, generateTop, getTopCells, getBatch } from '../gen/engine.js';
import { EDITS } from '../gen/edits.js';
import { LINEAR } from '../features/linear.js';

export const forbiddenPairs = () => getRules().filter(r => r.enabled && r.forbids).flatMap(r => r.forbids.map(p => [...p, r.exempt || (() => false)]));
function offMap() { return false; } // мир замкнут — края нет
export function countViolations(batches, lvl) {
  const pairs = forbiddenPairs(), bad = (a, b) => pairs.some(([x, y, ex]) => ((a.b === x && b.b === y) || (a.b === y && b.b === x)) && !ex(a) && !ex(b));
  const all = new Map(); batches.forEach((b, i) => b.cells.forEach(c => all.set(K(c.q, c.r), [i, c])));
  let total = 0, border = 0, breaks = 0;
  for (const [, [i, c]] of all) {
    for (const [a, bb] of DIRS.slice(0, 3)) { const n = all.get(K(c.q + a, c.r + bb)); if (n && bad(c, n[1])) { total++; if (n[0] !== i) border++; } }
    // линейные объекты: у соседа по каждой точке стыковки должна быть ответная (или полоса того же вида)
    for (const { ns } of Object.values(LINEAR)) {
      const nd = c.data[ns]; if (!nd || !nd.ports) continue;
      for (const p of nd.ports) {
        const o = all.get(K(c.q + DIRS[p.e][0], c.r + DIRS[p.e][1])); if (!o) continue; const on = o[1].data[ns];
        if (!(on && (on.band || (on.ports && on.ports.some(x => x.e === (p.e + 3) % 6 && x.s === p.s)))) && !offMap(lvl, o[1].q, o[1].r)) breaks++;
      }
    }
  }
  return { total, border, breaks };
}
// прогон по сидам: швы замыкания + выборка, два уровня вглубь, и независимость от порядка открытия.
// Правки текущего мира на время проверки откладываются; состояние (сид, кэш, верхний уровень) восстанавливается.
export function runSeamCheck(seeds = 6) {
  const savedEdits = new Map(EDITS); EDITS.clear();
  const saved = getSeed(); let views = 0, total = 0, border = 0, breaks = 0, orderOk = true;
  const view = (L, q, r) => [[q, r], ...DIRS.map(([a, b]) => [q + a, r + b])].map(([a, b]) => getBatch(L, a, b));
  for (let sd = 1; sd <= seeds; sd++) {
    setSeed(sd); resetCache(); generateTop();
    const topCells = getTopCells(), N = world.N;
    for (const t of topCells.filter((c, i) => c.q === 0 || c.r === 0 || c.q === N - 1 || c.r === N - 1 || i % 11 === 0)) {
      const v1 = view(TOP, t.q, t.r);
      const c = v1[0].cells.find(c => c.data.rivers && c.data.rivers.ports) || v1[0].cells.find(c => c.data.roads && c.data.roads.ports) || v1[0].cells[50];
      const v2 = view(TOP - 1, c.q, c.r);
      for (const v of [countViolations(v1, TOP - 1), countViolations(v2, TOP - 2)]) { views++; total += v.total; border += v.border; breaks += v.breaks; }
    }
    const t = topCells[(sd * 37) % topCells.length], A = JSON.stringify(getBatch(TOP, t.q, t.r).cells.map(c => [c.b, c.data.rivers, c.data.roads]));
    resetCache(); DIRS.forEach(([a, b]) => getBatch(TOP, t.q + a, t.r + b));
    if (A !== JSON.stringify(getBatch(TOP, t.q, t.r).cells.map(c => [c.b, c.data.rivers, c.data.roads]))) orderOk = false;
  }
  setSeed(saved); savedEdits.forEach((v, k) => EDITS.set(k, v)); resetCache(); generateTop();
  return { views, total, border, breaks, orderOk, pairs: forbiddenPairs() };
}
