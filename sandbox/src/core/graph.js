// Связные компоненты клеток по признаку (например, вода). edge = компонента упирается в «ничто» (сосед отсутствует).
export function waterComponents(cells, nbFn, isWater) {
  const seen = new Set(), comps = [];
  for (const c of cells) {
    if (!isWater(c) || seen.has(c)) continue;
    const comp = { cells: [], edge: false }, stack = [c]; seen.add(c);
    while (stack.length) { const x = stack.pop(); comp.cells.push(x); for (const nb of nbFn(x)) { if (!nb) { comp.edge = true; continue; } if (isWater(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); } } }
    comps.push(comp);
  }
  return comps;
}
