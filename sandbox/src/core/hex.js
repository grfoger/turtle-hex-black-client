// Геометрия гексов: flat-top, масштаб между уровнями 10, у родителя 100 детей. Чистые функции, без состояния.
export const SQ3 = Math.sqrt(3);
export const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]; // осевые направления: ЮВ, СВ, С, СЗ, ЮЗ, Ю (y вниз)
export const DIRS_RU = ['ЮВ', 'СВ', 'С', 'СЗ', 'ЮЗ', 'Ю'];
export const OWNED = new Set([0,2,4]); // рёбра, граница на которых принадлежит гексу (верх, низ-право, низ-лево)
export const toPx = (q, r, size = 1) => [size * 1.5 * q, size * SQ3 * (r + q / 2)];
export const hexNorm = (x, y, size) => Math.max(Math.abs(y) / (size * SQ3 / 2), (SQ3 * Math.abs(x) + Math.abs(y)) / (size * SQ3));
export function cubeRound(fq, fr) {
  const fs = -fq - fr; let q = Math.round(fq), r = Math.round(fr), s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s; return [q, r];
}
export const childRound = (x, y) => cubeRound(2 / 3 * x, -x / 3 + SQ3 / 3 * y); // точка → гекс (размер 1)
// родитель клетки: тот, в чьём гексе лежит её центр; на общем ребре — тот, чьё это ребро «своё»
export function parentOf(q, r) {
  const [x, y] = toPx(q, r), S = 10;
  const [Q0, R0] = cubeRound((2 / 3 * x) / S, (-x / 3 + SQ3 / 3 * y) / S);
  const hits = [[Q0, R0], ...DIRS.map(([a, b]) => [Q0 + a, R0 + b])]
    .filter(([Q, R]) => { const [cx, cy] = toPx(Q, R, S); return hexNorm(x - cx, y - cy, S) <= 1 + 1e-9; });
  if (hits.length === 1) return hits[0];
  const [A, B] = hits; const i = DIRS.findIndex(([a, b]) => A[0] + a === B[0] && A[1] + b === B[1]);
  return OWNED.has(i) ? A : B;
}
// смещения 100 детей относительно (10Q, 10R), пронумерованы построчно
export const CHILD_OFFSETS = [];
for (let q = -10; q <= 10; q++) for (let r = -10; r <= 10; r++) { const [Q, R] = parentOf(q, r); if (Q === 0 && R === 0) CHILD_OFFSETS.push([q, r]); }
CHILD_OFFSETS.sort((a, b) => (2 * a[1] + a[0]) - (2 * b[1] + b[0]) || a[0] - b[0]);
export const RING2 = []; for (let a = -2; a <= 2; a++) for (let b = Math.max(-2, -a - 2); b <= Math.min(2, -a + 2); b++) RING2.push([a, b]);
export const K = (q, r) => q + ',' + r;
export const hexDist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
export const dirIndex = (a, b) => DIRS.findIndex(([x, y]) => a[0] + x === b[0] && a[1] + y === b[1]);
export const unitDir = e => { const [x, y] = toPx(DIRS[e][0], DIRS[e][1]); return [x / SQ3, y / SQ3]; };
export function hexLine(a, b) {
  const n = hexDist(a, b), res = [];
  for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; res.push(cubeRound(a[0] + (b[0] - a[0]) * t + 1e-6, a[1] + (b[1] - a[1]) * t + 1e-6)); }
  return res;
}
// вершины гекса для отрисовки
export const hexPts = (cx, cy, size) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k; return `${(cx + size * Math.cos(a)).toFixed(3)},${(cy + size * Math.sin(a)).toFixed(3)}`; }).join(' ');
