// Конвейер правил мира: единый список в порядке выполнения.
// stage: top — вся карта верхнего уровня; draft — своя пачка + уровень выше; final — своя пачка + ЧЕРНОВИКИ 6 соседей (только чтение).
// ns — пространство имён в c.data, куда правило пишет (по умолчанию = id). Случайность у каждого правила своя (хэш id).
// forbids — пары биомов, которые не должны соседствовать; их проверяет общая проверка стыков (exempt — исключения).
// Порядок внутри этапа важен: от него зависит результат генерации.
import { strHash } from './core/random.js';
import { terrainRules as T } from './features/terrain.js';
import { riverRules as RV } from './features/rivers.js';
import { roadRules as RD } from './features/roads.js';

export const RULES = [
  T.base, T.neighbors, T.detachedWater, RV.top, RD.top,
  T.blend, T.inclusions, T.quota, RV.refine, RD.refine, RV.springs, RD.paths,
  T.continue, T.enclosedWater, T.lakeShore,
];
RULES.forEach(r => { r.enabled = true; r.ns = r.ns || r.id; r.h = strHash(r.id); r.values = Object.fromEntries(r.params.map(p => [p.key, p.value])); });
