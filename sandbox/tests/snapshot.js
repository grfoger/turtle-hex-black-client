// Эталонный снимок генерации: хэш тайлов фиксированного набора видов.
// Генератор детерминирован, поэтому рефакторинг без изменения поведения обязан давать тот же хэш до байта.
// api — адаптер к генератору (меняется вместе с устройством кода, сам набор видов — нет):
//   setSeed(s), reset() — сбросить кэш и правки и построить верхний уровень,
//   topCells() — клетки верхнего уровня, getBatch(L, Q, R) — пачка детей, editRoad(L, a, b, t) — правка дороги.
export const TOP_LEVEL = 6;

function fnv(str, h = 2166136261) {
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const cellsKey = cells => JSON.stringify(cells.map(c => [c.q, c.r, c.b, c.data]));

export function snapshot(api) {
  let h = 2166136261, tiles = 0;
  const add = cells => { h = fnv(cellsKey(cells), h); tiles += cells.length; };
  const pick = cells => cells.find(c => c.data.rivers && c.data.rivers.ports && c.data.rivers.ports.length)
    || cells.find(c => c.data.roads && c.data.roads.ports && c.data.roads.ports.length) || cells[50];
  for (const seed of [1, 2, 3]) {
    api.setSeed(seed); api.reset();
    const top = api.topCells(); add(top);
    const starts = top.filter((c, i) => i % 37 === 0 || (c.q === 0 && c.r < 4));
    for (const t of starts) {
      let b = api.getBatch(TOP_LEVEL, t.q, t.r); add(b.cells);
      for (let L = TOP_LEVEL - 1; L >= 2; L--) { const c = pick(b.cells); b = api.getBatch(L, c.q, c.r); add(b.cells); }
    }
    add(api.getBatch(TOP_LEVEL, -1, 3).cells); // запрос через шов замыкания
  }
  // правка мастера: дорога между двумя клетками верхнего уровня, затем дети этих клеток
  api.setSeed(1); api.reset();
  const top = api.topCells(), a = top.find(c => c.q === 5 && c.r === 5), b = top.find(c => c.q === 6 && c.r === 5);
  api.editRoad(TOP_LEVEL, a, b, 0);
  for (const c of [a, b]) add(api.getBatch(TOP_LEVEL, c.q, c.r).cells);
  return { hash: h.toString(16), tiles };
}
