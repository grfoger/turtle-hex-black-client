// Библиотека кварталов: типы клеток 10 м, районы и ручные модули.
// Модуль задаёт только 91 внутреннюю клетку квартала (100 м); 18 клеток на гранях (по 3 на грань — точки выхода)
// решает ребро, поэтому модуль можно поворачивать (×6) и отражать (×2).
import { toPx, hexNorm, DIRS, K, childRound } from '../core/hex.js';
import { portXY } from '../features/linear.js';

// ---- типы клеток 10 м ----
export const CELL = {
  '.': { name: 'Улица', color: '#d9d0c0', pass: true },
  '=': { name: 'Главная улица', color: '#c4ad84', pass: true },
  ',': { name: 'Переулок', color: '#e8e2d6', pass: true },
  'o': { name: 'Площадь', color: '#ece0c2', pass: true },
  'w': { name: 'Колодец / фонтан', color: '#6fa8dc', pass: true },
  'M': { name: 'Торговые ряды', color: '#e3a64a', pass: true },
  'R': { name: 'Ратуша', color: '#8e3b46', building: true, whole: true },
  'C': { name: 'Храм', color: '#6d63a8', building: true, whole: true },
  'T': { name: 'Таверна', color: '#c0662b', building: true, whole: true },
  'S': { name: 'Лавка', color: '#d4b04a', building: true, max: 2 },
  'H': { name: 'Богатый дом', color: '#9c5a3c', building: true, max: 4 },
  'h': { name: 'Дом', color: '#b89270', building: true, max: 3 },
  'p': { name: 'Лачуга', color: '#958b7e', building: true, max: 2 },
  'g': { name: 'Сад / двор', color: '#a5cf78' },
  'W': { name: 'Городская стена', color: '#55524d' },
};
export const isPass = t => !!(CELL[t] && CELL[t].pass);

// ---- геометрия квартала (в координатах детей относительно центра квартала) ----
export const INTERIOR = [];
for (let k = -9; k <= 9; k++) for (let q = -6; q <= 6; q++) {
  if ((q - k) & 1) continue; const r = (k - q) / 2, [x, y] = toPx(q, r);
  if (hexNorm(x, y, 10) < 1 - 1e-9) INTERIOR.push([q, r]);
}
const INSIDE = new Set(INTERIOR.map(([q, r]) => K(q, r)));
export const isInterior = (q, r) => INSIDE.has(K(q, r));
// клетка на грани e в слоте s (-1, 0, 1 — слот ребра в его каноничной записи) и её внутренние соседи
export const EDGE = DIRS.map((_, e) => [-1, 0, 1].map(s => childRound(...portXY(0, 0, e, s, 10))));
export const EDGE_NB = EDGE.map(row => row.map(([q, r]) => DIRS.map(([a, b]) => [q + a, r + b]).filter(([a, b]) => isInterior(a, b))));

// повороты и отражения: (q, r) → поворот на 60°; отражение относительно вертикали
const rot = ([q, r]) => [-r, q + r], mir = ([q, r]) => [-q, r + q];
export function variant(mod, k, m) {
  const out = new Map();
  for (const [key, t] of mod.cells) { let p = key.split(',').map(Number); if (m) p = mir(p); for (let i = 0; i < k; i++) p = rot(p); out.set(K(p[0], p[1]), t); }
  return out;
}

// ---- ручные модули: 19 строк (сверху вниз через полклетки), непробельные символы заполняют внутренние клетки строки слева направо ----
function parse(id, name, rows) {
  if (rows.length !== 19) throw new Error(id + ': нужно 19 строк');
  const cells = new Map();
  rows.forEach((line, i) => {
    const k = i - 9, chars = line.replace(/\s/g, ''), qs = INTERIOR.filter(([q, r]) => 2 * r + q === k).map(([q]) => q).sort((a, b) => a - b);
    if (chars.length !== qs.length) throw new Error(`${id}: строка ${k} — нужно ${qs.length} клеток, есть ${chars.length}`);
    qs.forEach((q, j) => { if (!CELL[chars[j]]) throw new Error(`${id}: неизвестная клетка «${chars[j]}»`); cells.set(K(q, (k - q) / 2), chars[j]); });
  });
  return { id, name, cells };
}

export const MODULES = [
  parse('market', 'Рыночная площадь', [
    '   S . . S   ',
    '    S . S    ',
    '   S o o S   ',
    '  . o o o .  ',
    '   o M o o   ',
    '  T o M o S  ',
    ' . o o o M . ',
    '  o M o o o  ',
    ' S o o o M S ',
    '. o M w o o .',
    ' S o o M o S ',
    '  o o o M o  ',
    ' . M o o o . ',
    '  S o M o T  ',
    '   o o M o   ',
    '  . o o o .  ',
    '   S o o S   ',
    '    S . S    ',
    '   S . . S   ']),
  parse('townhall', 'Ратуша', [
    '   H . g H   ',
    '    H . H    ',
    '   g . . g   ',
    '  H . . . H  ',
    '   . R R .   ',
    '  . R R R .  ',
    ' H . R R . H ',
    '  . R R R .  ',
    ' H . R R . H ',
    '. . o o o . .',
    ' H o o o o H ',
    '  . o w o .  ',
    ' H o o o o H ',
    '  . o o o .  ',
    '   S . . S   ',
    '  H S . S H  ',
    '   H . . H   ',
    '    g . g    ',
    '   H . . H   ']),
  parse('temple', 'Храм', [
    '   g g g g   ',
    '    g g g    ',
    '   . g g .   ',
    '  . g C g .  ',
    '   . C C .   ',
    '  . g C g .  ',
    ' h . C C . h ',
    '  . g C g .  ',
    ' h . C C . h ',
    '. . . C . . .',
    ' h o o o o h ',
    '  . o w o .  ',
    ' h o o o o h ',
    '  . . o . .  ',
    '   h . . h   ',
    '  h h . h h  ',
    '   h . . h   ',
    '    h . h    ',
    '   h . . h   ']),
  parse('tavern', 'Таверна на перекрёстке', [
    '   h . . h   ',
    '    S . S    ',
    '   h . . h   ',
    '  h S . T h  ',
    '   S . T T   ',
    '  . . o T g  ',
    ' . . o o T g ',
    '  S o w o .  ',
    ' h S o o . . ',
    '. . . o . . .',
    ' h S . . S h ',
    '  h S . S h  ',
    ' h h . . h h ',
    '  h S . S h  ',
    '   h . . h   ',
    '  h h . h h  ',
    '   h . . h   ',
    '    h . h    ',
    '   h . . h   ']),
];
export const MODULE = Object.fromEntries(MODULES.map(m => [m.id, m]));

// ---- районы: особые берут ручные модули, обычные строятся по шаблону ----
// density — шанс улицы на ребре; jitter — извилистость улиц; alleys — число переулков;
// front/back — что стоит вдоль улицы и в глубине квартала: [тип, вероятность, иначе тип]
export const DISTRICTS = {
  market: { name: 'Рынок', color: '#e3a64a', modules: ['market'], density: 1 },
  townhall: { name: 'Ратуша', color: '#8e3b46', modules: ['townhall'], density: 0.7 },
  temple: { name: 'Храм', color: '#6d63a8', modules: ['temple'], density: 0.6 },
  tavern: { name: 'Таверна', color: '#c0662b', modules: ['tavern'], density: 0.6 },
  rich: { name: 'Богатые дома', color: '#9c5a3c', density: 0.4, jitter: 0.4, alleys: 1, front: ['H', 0.85, 'g'], back: ['g', 1, 'g'], fill: 'H' },
  middle: { name: 'Средний достаток', color: '#b89270', density: 0.5, jitter: 1, alleys: 1, front: ['h', 0.92, 'S'], back: ['h', 0.45, 'g'], fill: 'h' },
  poor: { name: 'Бедняки', color: '#958b7e', density: 0.55, jitter: 2.2, alleys: 3, front: ['p', 1, 'p'], back: ['p', 0.75, 'g'], fill: 'p' },
};
