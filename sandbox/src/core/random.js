// Детерминированная случайность: всё выводится из сида мира и «пространства имён» (id правила, уровень, координаты…).
let seed = 1;
export const setSeed = s => { seed = s | 0; };
export const getSeed = () => seed;
export function hash(...ns) {
  let h = (0x9e3779b9 ^ seed) | 0;
  for (const n of ns) { h = Math.imul(h ^ (n | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}
export function rngFrom(...ns) { let a = Math.floor(hash(...ns) * 4294967296); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const strHash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h | 0; };
// value noise на целочисленной решётке
export function vnoise(x, y, a, b, c) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const p = hash(a, b, c, ix, iy), q = hash(a, b, c, ix + 1, iy), r = hash(a, b, c, ix, iy + 1), s = hash(a, b, c, ix + 1, iy + 1);
  return p + (q - p) * sx + (r - p) * sy + (p - q - r + s) * sx * sy;
}
export const mod = (a, n) => ((a % n) + n) % n;
// value noise на решётке, замкнутой по модулю n (для мира-тора)
export function pvnoise(u, v, n, a, b, c) {
  const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv), m = k => mod(k, n);
  const p = hash(a, b, c, m(iu), m(iv)), q = hash(a, b, c, m(iu + 1), m(iv)), r = hash(a, b, c, m(iu), m(iv + 1)), t = hash(a, b, c, m(iu + 1), m(iv + 1));
  return p + (q - p) * su + (r - p) * sv + (p - q - r + t) * su * sv;
}
