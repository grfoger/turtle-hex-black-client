// Мир — тор: на верхнем уровне осевые q, r берутся по модулю N → кругосветка за N шагов в любом из 6 направлений.
// На уровне L период N·10^(TOP−L) (дети родителя (Q,R) — это (10Q,10R)), поэтому замыкание наследуется само.
import { DIRS, SQ3, hexDist } from '../core/hex.js';
import { mod, pvnoise } from '../core/random.js';
import { TOP, world } from './config.js';

export const period = L => world.N * Math.pow(10, TOP - L);
export const wrap = (L, q, r) => { const P = period(L); return [mod(q, P), mod(r, P)]; };
// направление и расстояние с учётом замыкания (для клеток в «каноничных» координатах)
export function dirW(L, a, b) { const P = period(L); return DIRS.findIndex(([x, y]) => mod(a[0] + x - b[0], P) === 0 && mod(a[1] + y - b[1], P) === 0); }
export function distW(L, a, b) { const P = period(L); let best = Infinity; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) best = Math.min(best, hexDist(a, [b[0] + i * P, b[1] + j * P])); return best; }
// периодический шум от позиции (x, y) уровня L; sz — примерный размер пятен в клетках.
// Решётка шума — в осевых координатах, целое число ячеек на период → без шва на замыкании.
export function pnoise(L, x, y, sz, a, b, c) {
  const P = period(L), n = Math.max(1, Math.round(P / sz)), u = (2 / 3 * x) * n / P, v = (-1 / 3 * x + SQ3 / 3 * y) * n / P;
  return 0.65 * pvnoise(u, v, n, a, b, c * 2) + 0.35 * pvnoise(u * 2 + 17, v * 2 - 9, 2 * n, a, b, c * 2 + 1);
}
