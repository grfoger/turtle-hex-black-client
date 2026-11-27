// Отрисовка модуля-цветка в стиле «настольная игра», без крыш (крыши — отдельный слой).
// Стены, двери и окна берутся из walls.js: всё стоит на клетках 1 м.
import { DIRS, hexPts } from '../core/hex.js';
import { rngFrom, strHash } from '../core/random.js';
import { S, buildMap, cellAt, frame } from './walls.js';
import { inPoly } from './quarter.js';
import { CELLS10, R10, EDGES, BAND, ROOM, VARIANTS, inFlower, buildFlowerPlan } from './flower.js';

const $ = id => document.getElementById(id), svg = $('svg');
const f2 = v => v.toFixed(3), P2 = p => f2(p[0]) + ',' + f2(p[1]), pts = poly => poly.map(P2).join(' ');
let plan, map, reach = null;

// ---------- узоры полов (поворачиваются вместе с домом) ----------
function patterns() {
  let d = '';
  for (let k = 0; k < 12; k++) {
    const rot = `patternTransform="rotate(${k * 30})"`;
    // доски: 4 полосы по 0,3 м разного тона, стыки вразбежку
    d += `<pattern id="plank${k}" width="2.4" height="1.2" patternUnits="userSpaceOnUse" ${rot}>` +
      ['#d6b48b', '#cfab80', '#dbbb94', '#c9a378'].map((c, i) => `<rect y="${i * 0.3}" width="2.4" height="0.3" fill="${c}"/><line x1="0" y1="${i * 0.3 + 0.295}" x2="2.4" y2="${i * 0.3 + 0.295}" stroke="#a9845a" stroke-width="0.025"/><line x1="${[0.7, 1.9, 1.2, 0.3][i]}" y1="${i * 0.3}" x2="${[0.7, 1.9, 1.2, 0.3][i]}" y2="${i * 0.3 + 0.3}" stroke="#a9845a" stroke-width="0.03"/>`).join('') +
      `<circle cx="0.4" cy="0.15" r="0.03" fill="#8f6c45"/><circle cx="1.6" cy="0.75" r="0.03" fill="#8f6c45"/></pattern>`;
    // плитка 0,6 м в шахматку
    d += `<pattern id="tile${k}" width="1.2" height="1.2" patternUnits="userSpaceOnUse" ${rot}><rect width="1.2" height="1.2" fill="#bfb09a"/>` +
      [[0, 0, '#e6d9c4'], [0.6, 0, '#d4c3a8'], [0, 0.6, '#d4c3a8'], [0.6, 0.6, '#e6d9c4']].map(([x, y, c]) => `<rect x="${x + 0.03}" y="${y + 0.03}" width="0.54" height="0.54" fill="${c}"/>`).join('') + `</pattern>`;
    // каменные плиты
    d += `<pattern id="stone${k}" width="2" height="1.6" patternUnits="userSpaceOnUse" ${rot}><rect width="2" height="1.6" fill="#8e877b"/>` +
      [[0.04, 0.04, 0.9, 0.72, '#b4ada1'], [0.98, 0.04, 0.98, 0.72, '#a9a296'], [0.04, 0.8, 0.62, 0.76, '#a39c90'], [0.7, 0.8, 0.8, 0.76, '#b8b1a5'], [1.54, 0.8, 0.42, 0.76, '#aca599']].map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.06" fill="${c}"/>`).join('') + `</pattern>`;
  }
  d += `<pattern id="yard" width="3" height="2.4" patternUnits="userSpaceOnUse"><rect width="3" height="2.4" fill="#a49880"/>` +
    [[0.05, 0.05, 1.4, 1.1, '#c9bda2'], [1.5, 0.05, 1.45, 1.1, '#c2b69b'], [0.05, 1.2, 0.9, 1.15, '#bfb397'], [1, 1.2, 1.2, 1.15, '#cbbfa5'], [2.25, 1.2, 0.7, 1.15, '#c5b99e']].map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.1" fill="${c}"/>`).join('') + `</pattern>`;
  d += `<filter id="sh" x="-20" y="-20" width="40" height="40" filterUnits="userSpaceOnUse"><feGaussianBlur in="SourceAlpha" stdDeviation="0.12"/><feOffset dx="0.12" dy="0.16"/><feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  d += `<filter id="wsh" x="-20" y="-20" width="40" height="40" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="0.22"/></filter>`;
  d += `<radialGradient id="glow"><stop offset="0" stop-color="#ffd36a"/><stop offset="0.5" stop-color="#f08a3a"/><stop offset="1" stop-color="#b8402a"/></radialGradient>`;
  d += `<clipPath id="fl">${CELLS10.map(([x, y]) => `<polygon points="${hexPts(x, y, R10 + 0.02)}"/>`).join('')}</clipPath>`;
  return `<defs>${d}</defs>`;
}

// ---------- брусчатка: отдельные камни в клетках улиц ----------
function cobbles(isStreet, tone) {
  const rng = rngFrom(strHash('cobble'), tone.length); let s = '';
  const pal = tone === 'lane' ? ['#cfc4ad', '#d8cdb6', '#c6bba3', '#ddd3bd'] : ['#b9ad96', '#c4b8a0', '#ab9f88', '#cfc3ab', '#b3a790'];
  for (let x = -16; x <= 16; x += 0.5) for (let y = -16; y <= 16; y += 0.45) {
    const jx = x + (Math.floor(y / 0.45) % 2 ? 0.25 : 0) + (rng() - 0.5) * 0.08, jy = y + (rng() - 0.5) * 0.06;
    if (!inFlower(jx, jy) || !isStreet(jx, jy)) continue;
    s += `<rect x="${f2(jx - 0.21)}" y="${f2(jy - 0.17)}" width="0.42" height="0.34" rx="0.1" fill="${pal[Math.floor(rng() * pal.length)]}" transform="rotate(${f2((rng() - 0.5) * 14)} ${f2(jx)} ${f2(jy)})"/>`;
  }
  return s;
}
const dSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };

// ---------- обстановка: рисуем в системе комнаты (x — вдоль фасада, y — вглубь от улицы) ----------
const R = (x, y, w, h, fill, ex = '') => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${fill}" ${ex}/>`;
const wood = (x, y, w, h, c = '#a8743f') => R(x, y, w, h, c, 'rx="0.06" stroke="#5c3d1f" stroke-width="0.05"') + `<line x1="${f2(x + 0.08)}" y1="${f2(y + h * 0.35)}" x2="${f2(x + w - 0.08)}" y2="${f2(y + h * 0.35)}" stroke="#8a5a2e" stroke-width="0.025" opacity="0.6"/>`;
const chair = (x, y) => R(x - 0.2, y - 0.2, 0.4, 0.4, '#8a5a2e', 'rx="0.07" stroke="#5c3d1f" stroke-width="0.04"') + R(x - 0.2, y - 0.2, 0.4, 0.08, '#6e4520');
const barrel = (x, y, r = 0.32) => `<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="#9c6b3c" stroke="#4f3418" stroke-width="0.06"/><circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r * 0.72)}" fill="none" stroke="#6e4a26" stroke-width="0.04"/><circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r * 0.3)}" fill="#7d5530"/>`;
const crate = (x, y, s = 0.6) => R(x, y, s, s, '#b88a52', 'stroke="#6b4a26" stroke-width="0.05"') + R(x + 0.06, y + 0.06, s - 0.12, s - 0.12, 'none', 'stroke="#8a6438" stroke-width="0.03"') + `<path d="M${f2(x + 0.06)},${f2(y + 0.06)}L${f2(x + s - 0.06)},${f2(y + s - 0.06)}" stroke="#8a6438" stroke-width="0.04"/>`;
const sack = (x, y) => `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="0.28" ry="0.22" fill="#d9c79b" stroke="#a8935f" stroke-width="0.04"/><path d="M${f2(x - 0.08)},${f2(y - 0.2)}q0.08,-0.1 0.16,0" stroke="#a8935f" stroke-width="0.04" fill="none"/>`;
const rug = (x, y, w, h, c) => R(x, y, w, h, c, 'rx="0.08"') + R(x + 0.12, y + 0.12, w - 0.24, h - 0.24, 'none', 'stroke="#e8d7a8" stroke-width="0.05" stroke-dasharray="0.12 0.06"');
const hearth = (x, y, w, h) => R(x, y, w, h, '#8f8a80', 'rx="0.05" stroke="#5e5a53" stroke-width="0.06"') + R(x + 0.15, y + 0.15, w - 0.3, h - 0.3, '#3e3a36', 'rx="0.05"') + `<ellipse cx="${f2(x + w / 2)}" cy="${f2(y + h / 2)}" rx="${f2((w - 0.3) * 0.38)}" ry="${f2((h - 0.3) * 0.38)}" fill="url(#glow)"/>`;
const stairs = (x, y, w, h) => { let s = R(x, y, w, h, '#b5926a', 'stroke="#5c3d1f" stroke-width="0.05"'); for (let i = 1; i < 8; i++) s += `<line x1="${f2(x)}" y1="${f2(y + i * h / 8)}" x2="${f2(x + w)}" y2="${f2(y + i * h / 8)}" stroke="#6e4a26" stroke-width="0.04"/>`;
  return s + `<path d="M${f2(x + w / 2)},${f2(y + h - 0.3)}V${f2(y + 0.35)}m-0.15,0.2l0.15,-0.2l0.15,0.2" stroke="#3e2a14" stroke-width="0.05" fill="none"/>`; };
const shelf = (x, y, w, h) => { let s = R(x, y, w, h, '#7a5230', 'stroke="#4f3418" stroke-width="0.04"'); const n = Math.floor((w > h ? w : h) / 0.28);
  for (let i = 0; i < n; i++) { const c = ['#c94f3d', '#e3b23c', '#5c8fc4', '#8fb85a', '#d9d0bd'][i % 5]; s += w > h ? R(x + 0.06 + i * 0.28, y + 0.06, 0.2, h - 0.12, c, 'rx="0.04"') : R(x + 0.06, y + 0.06 + i * 0.28, w - 0.12, 0.2, c, 'rx="0.04"'); } return s; };
const bed = (x, y, w, h, c) => R(x, y, w, h, '#7a5230', 'rx="0.08"') + R(x + 0.08, y + h * 0.3, w - 0.16, h * 0.66, c, 'rx="0.08"') + `<path d="M${f2(x + 0.15)},${f2(y + h * 0.55)}q${f2(w * 0.3)},0.15 ${f2(w - 0.3)},0" stroke="#0003" stroke-width="0.04" fill="none"/>` + R(x + 0.15, y + 0.1, w - 0.3, h * 0.2, '#f3efe4', 'rx="0.1"');

function furnish(type, W, D, rng) {
  const x0 = 0.3, y0 = 0.3, x1 = W - 0.3, y1 = D - 0.3, cx = W / 2, cy = D / 2; let s = '';
  if (type === 'shop') {
    s += shelf(x0, y1 - 0.35, x1 - x0, 0.35) + shelf(x0, y0 + 0.9, 0.35, Math.max(0.6, D * 0.4));
    s += wood(x0 + 0.6, D * 0.48, Math.max(0.6, W - 2.2), 0.55, '#9c6a38');
    s += crate(x1 - 0.8, y0 + 0.2) + sack(x1 - 1.3, y0 + 0.55) + barrel(x0 + 1.2, y1 - 0.9, 0.28);
  } else if (type === 'dwelling') {
    s += rug(cx - 1.2, cy - 0.8, 2.4, 1.6, '#8c3b3b') + wood(cx - 0.6, cy - 0.35, 1.2, 0.7) + chair(cx - 0.85, cy) + chair(cx + 0.85, cy) + chair(cx, cy - 0.65) + chair(cx, cy + 0.65);
    s += hearth(x1 - 0.65, y0 + 0.6, 0.65, 1.3) + wood(x0, y1 - 0.55, 1, 0.5, '#7d5530') + R(x0 + 0.3, y0, 1.4, 0.35, '#8a5a2e', 'rx="0.05"');
  } else if (type === 'kitchen') {
    s += hearth(x1 - 1.1, y1 - 1, 1.1, 1) + wood(cx - 0.7, cy - 0.3, 1.4, 0.6, '#b98b55') + barrel(x0 + 0.35, y1 - 0.35) + barrel(x0 + 1.05, y1 - 0.35, 0.28) + shelf(x1 - 0.3, y0 + 0.2, 0.3, Math.max(0.6, D - 1.8));
    if (D > 2.4) s += stairs(x0, y0, 0.85, Math.min(2.2, D - 1.2));
  } else if (type === 'workshop') {
    s += wood(x0, y0 + 0.4, 0.7, Math.max(0.8, D - 1.2), '#a77a48') + R(x1 - 0.4, y0 + 0.4, 0.3, Math.max(0.6, D * 0.5), '#6e4a26') + crate(cx, y1 - 0.8) + crate(cx + 0.65, y1 - 0.75, 0.5);
    for (let i = 0; i < 4; i++) s += R(cx - 1.2, y0 + 0.6 + i * 0.22, 1.6, 0.16, '#c9a06a', 'rx="0.05" stroke="#8a6438" stroke-width="0.02"');
  } else if (type === 'bakery') {
    s += `<rect x="${f2(x1 - 1.6)}" y="${f2(y0)}" width="1.6" height="1.4" rx="0.5" fill="#a3523a" stroke="#6b3020" stroke-width="0.06"/><ellipse cx="${f2(x1 - 0.8)}" cy="${f2(y0 + 1.1)}" rx="0.45" ry="0.25" fill="url(#glow)"/>`;
    s += wood(x0 + 0.2, cy - 0.35, Math.max(0.8, W - 2.6), 0.7, '#c49a63') + sack(x0 + 0.4, y1 - 0.35) + sack(x0 + 0.95, y1 - 0.3) + shelf(x0, y0, 1.6, 0.3);
  } else if (type === 'bedroom') {
    s += bed(x0, y0 + 0.2, 1, 1.9, '#5b7fa6') + (W > 3 ? bed(x0 + 1.2, y0 + 0.2, 1, 1.9, '#8a6aa6') : '') + wood(x1 - 0.9, y1 - 0.5, 0.9, 0.45, '#7d5530') + R(x1 - 0.5, y0 + 0.2, 0.5, 1.1, '#6e4520', 'stroke="#4f3418" stroke-width="0.04"');
    if (D > 3.2) s += stairs(x1 - 0.9, y1 - 2.5, 0.85, 1.9);
  } else if (type === 'tavern') {
    for (const [tx, ty] of [[1.4, 1.4], [3.6, 1.4], [1.4, 3.6]]) if (tx + 0.7 < W && ty + 0.6 < D) s += wood(tx - 0.6, ty - 0.4, 1.2, 0.8, '#9c6a38') + R(tx - 0.6, ty - 0.75, 1.2, 0.25, '#7d5530', 'rx="0.05"') + R(tx - 0.6, ty + 0.5, 1.2, 0.25, '#7d5530', 'rx="0.05"');
    s += wood(x1 - 0.7, y0 + 0.8, 0.55, Math.max(1, D - 2), '#8a5a2e') + barrel(x1 - 0.25, y0 + 0.4, 0.26) + barrel(x1 - 0.25, y1 - 0.3, 0.26) + hearth(x0, y1 - 1.2, 1.2, 0.9);
  } else if (type === 'hall') {
    // зал гильдии: два длинных стола с лавками вдоль, стол старшин у дальней стены, камин
    for (const tx of [W * 0.3, W * 0.62]) if (D > 2.6) s += R(tx - 0.95, y0 + 0.9, 0.3, D - 2.2, '#7d5530', 'rx="0.05"') + wood(tx - 0.6, y0 + 0.9, 0.8, D - 2.2, '#9c6a38') + R(tx + 0.25, y0 + 0.9, 0.3, D - 2.2, '#7d5530', 'rx="0.05"');
    s += wood(cx - 1.4, y1 - 0.75, 2.8, 0.6, '#6e4520') + chair(cx - 0.8, y1 - 0.1) + chair(cx, y1 - 0.1) + chair(cx + 0.8, y1 - 0.1) + hearth(x1 - 0.7, cy - 0.7, 0.7, 1.4);
    s += rug(cx - 0.8, y0 + 0.1, 1.6, 0.6, '#3c5f8c');
  } else if (type === 'store') {
    s += crate(x0, y0) + crate(x0 + 0.65, y0) + crate(x0, y0 + 0.65, 0.55) + barrel(x1 - 0.35, y0 + 0.35) + barrel(x1 - 0.35, y0 + 1.05) + sack(cx, y1 - 0.3) + sack(cx + 0.55, y1 - 0.35);
    if (D > 2.4) s += stairs(x1 - 0.9, y1 - 2.2, 0.85, 1.9);
  }
  return s;
}

// ---------- сборка ----------
function load() {
  plan = buildFlowerPlan(+$('seed').value || 1, $('variant').value);
  map = buildMap([...plan.buildings, ...plan.fences], [-16, -16, 16, 16], $('open').checked, inFlower);
  reach = null; draw();
}
function draw() {
  let s = patterns();
  s += `<rect x="-17" y="-17" width="34" height="34" fill="#dcd6c8"/>`;
  let g = `<rect x="-17" y="-17" width="34" height="34" fill="url(#yard)"/>`;
  // пятна травы и клумбы в нейтральной полосе (дворы)
  const rng = rngFrom(strHash('grass'), plan.seed);
  for (let i = 0; i < 18; i++) { const e = EDGES[Math.floor(rng() * EDGES.length)], t = rng(), p = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t], c = [p[0] * 0.92, p[1] * 0.92];
    g += `<ellipse cx="${f2(c[0])}" cy="${f2(c[1])}" rx="${f2(0.8 + rng())}" ry="${f2(0.5 + rng() * 0.6)}" fill="#8fae62" opacity="0.85"/>`; }
  // улицы: подложка + камни
  const isMain = (x, y) => Math.abs(x) <= 2, isHalf = (x, y) => plan.half.some(e => dSeg([x, y], e.a, e.b) <= 2);
  g += `<rect x="-2" y="-17" width="4" height="34" fill="#8f8573"/>`;
  g += `<path d="${plan.half.map(e => `M${P2(e.a)}L${P2(e.b)}`).join('')}" stroke="#8f8573" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" fill="none"/>`;
  g += cobbles((x, y) => isMain(x, y) || isHalf(x, y), 'main');
  g += `<line x1="0" y1="-17" x2="0" y2="17" stroke="#6f6656" stroke-width="0.12" stroke-dasharray="0.4 0.15" opacity="0.7"/>`;
  // дома: полы комнат
  for (const b of plan.buildings) for (const rm of b.rooms) {
    const P = (u, v) => b.f.P(u, v), poly = [P(b.u[0], rm.v[0]), P(b.u[1], rm.v[0]), P(b.u[1], rm.v[1]), P(b.u[0], rm.v[1])];
    g += `<polygon points="${pts(poly)}" fill="url(#${ROOM[rm.type].floor}${b.k})"/>`;
  }
  // обстановка
  let fur = '';
  for (const b of plan.buildings) for (const rm of b.rooms) {
    const f = b.f, s1 = b.side, vS = s1 > 0 ? rm.v[0] : rm.v[1], O = f.P(b.u[0], vS), ex = f.eu, ey = [f.ev[0] * s1, f.ev[1] * s1];
    const W = (b.u[1] - b.u[0]) * f.du, D = Math.abs(rm.v[1] - rm.v[0]) * f.dv, rr = rngFrom(strHash('fur'), b.u[0], rm.v[0]);
    fur += `<g transform="matrix(${f2(ex[0])},${f2(ex[1])},${f2(ey[0])},${f2(ey[1])},${f2(O[0])},${f2(O[1])})">${furnish(rm.type, W, D, rr)}</g>`;
  }
  g += `<g filter="url(#sh)">${fur}</g>`;
  // двор: колодец, бочки, поленница — в свободных местах
  const free = (x, y, r) => inFlower(x, y) && Math.abs(x) > 2 + r && !plan.half.some(e => dSeg([x, y], e.a, e.b) < 2 + r) && !plan.buildings.some(b => inPoly([x, y], b.poly) || b.poly.some((q, i, a) => dSeg([x, y], q, a[(i + 1) % a.length]) < r)) && EDGES.every(e => dSeg([x, y], e.a, e.b) > r + 0.3);
  let well = null; for (let y = -6; y <= 9 && !well; y += 0.5) for (const x of [7, 8.5, 6, 10, -7, -8.5, -6, -10]) if (free(x, y, 1.6)) { well = [x, y]; break; }
  if (well) g += `<g filter="url(#sh)"><circle cx="8.4" cy="7.2" r="0.85" fill="#8a8a85" stroke="#55554f" stroke-width="0.12"/><circle cx="8.4" cy="7.2" r="0.52" fill="#3f78ad"/><circle cx="8.25" cy="7.05" r="0.12" fill="#9cc6ea"/>${barrel(10.3, 6.6)}${barrel(10.9, 7.2, 0.28)}${crate(6.4, 8.1)}</g>`.replace(/8.4/g, f2(well[0])).replace(/7.2/g, f2(well[1])).replace(/10.3/g, f2(well[0] + 1.6)).replace(/6.6/g, f2(well[1] - 0.5)).replace(/10.9/g, f2(well[0] + 1.6)).replace(/6.4/g, f2(well[0] - 1.9)).replace(/8.1/g, f2(well[1] + 0.6)).replace(/8.25/g, f2(well[0] - 0.15)).replace(/7.05/g, f2(well[1] - 0.15));
  // стены: тень, кладка, проёмы
  let wd = '', corners = new Set(), windows = '', doorsSvg = '';
  for (const w of map.walls) {
    let t = 0; const segs = [], P = q => [w.A[0] + w.dir[0] * q, w.A[1] + w.dir[1] * q];
    for (const [a, b] of [...w.doors].sort((p, q) => p[0] - q[0])) { segs.push([t, a]); t = b; } segs.push([t, w.len]);
    for (const [a, b] of segs) if (b > a) wd += `M${P2(P(a))}L${P2(P(b))}`;
    corners.add(P2(w.A)); corners.add(P2(w.B));
    // двери: створка внутрь дома и дуга
    for (const [a, b, isArch] of w.doors) { if (isArch) continue; const h = P(a), e = P(b), n = w.n, L = b - a, tip = [h[0] + n[0] * L, h[1] + n[1] * L];
      doorsSvg += `<line x1="${f2(h[0])}" y1="${f2(h[1])}" x2="${f2(tip[0])}" y2="${f2(tip[1])}" stroke="#6e4520" stroke-width="0.12" stroke-linecap="round"/><path d="M${P2(tip)}A${f2(L)},${f2(L)} 0 0 ${w.n[0] * w.dir[1] - w.n[1] * w.dir[0] > 0 ? 0 : 1} ${P2(e)}" fill="none" stroke="#6e4520" stroke-width="0.04" stroke-dasharray="0.15 0.1"/>`; }
    // окна: в проходах клеток наружных стен, не у дверей и углов
    if (!w.inner && w.pass) { let last = -9; for (const q of w.pass) { if (q < 0.9 || q > w.len - 0.9 || w.doors.some(([a, b]) => q > a - 0.9 && q < b + 0.9) || q - last < 1.6) continue; last = q;
      const a = P(q - 0.4), b = P(q + 0.4); windows += `<line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke="#e8eef2" stroke-width="0.36"/><line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke="#7fb3d8" stroke-width="0.16"/>`; } }
  }
  const cornerSq = [...corners].map(c => { const [x, y] = c.split(',').map(Number); return `<rect x="${f2(x - 0.25)}" y="${f2(y - 0.25)}" width="0.5" height="0.5" fill="#3e3328"/>`; }).join('');
  g += `<g filter="url(#wsh)" opacity="0.5" transform="translate(0.22,0.28)"><path d="${wd}" stroke="#000" stroke-width="0.5" fill="none"/></g>`;
  g += `<path d="${wd}" stroke="#3e3328" stroke-width="0.5" fill="none"/>${cornerSq}<path d="${wd}" stroke="#8b7b66" stroke-width="0.3" stroke-dasharray="0.5 0.07" fill="none"/>`;
  g += windows + doorsSvg;
  // крыши (отдельный слой)
  if ($('roofs').checked) for (const b of plan.buildings) {
    const f = b.f, W = (b.u[1] - b.u[0]) * f.du, D = (b.v[1] - b.v[0]) * f.dv, O = f.P(b.u[0], b.v[0]);
    const [c1, c2] = [['#d9775a', '#b0533c'], ['#8e97a6', '#6a7382'], ['#c08a57', '#946638']][Math.abs(b.u[0]) % 3];
    const ridgeU = W >= D, m = ridgeU ? D / 2 : W / 2;
    const inner = ridgeU ? `<rect width="${f2(W)}" height="${f2(D / 2)}" fill="${c1}"/><rect y="${f2(D / 2)}" width="${f2(W)}" height="${f2(D / 2)}" fill="${c2}"/><line x1="0" y1="${f2(m)}" x2="${f2(W)}" y2="${f2(m)}" stroke="#3a2a1c" stroke-width="0.12"/>` : `<rect width="${f2(W / 2)}" height="${f2(D)}" fill="${c1}"/><rect x="${f2(W / 2)}" width="${f2(W / 2)}" height="${f2(D)}" fill="${c2}"/><line x1="${f2(m)}" y1="0" x2="${f2(m)}" y2="${f2(D)}" stroke="#3a2a1c" stroke-width="0.12"/>`;
    g += `<g filter="url(#sh)" transform="matrix(${f2(f.eu[0])},${f2(f.eu[1])},${f2(f.ev[0])},${f2(f.ev[1])},${f2(O[0])},${f2(O[1])})">${inner}<rect width="${f2(W)}" height="${f2(D)}" fill="none" stroke="#3a2a1c" stroke-width="0.12"/></g>`;
  }
  s += `<g clip-path="url(#fl)">${g}</g>`;
  // наложения: клетки 1 м, договор границы, достижимость
  if ($('cells').checked || reach) {
    let c = '';
    for (const cl of map.cells.values()) { const fill = reach ? (reach.has(cl.q + ',' + cl.r) ? '#ffd54f88' : 'none') : cl.wall ? '#55555577' : cl.door ? '#ff980099' : cl.arch ? '#43a04799' : 'none';
      c += `<polygon points="${hexPts(cl.x, cl.y, S)}" fill="${fill}" stroke="#0004" stroke-width="0.025"/>`; }
    s += `<g clip-path="url(#fl)" pointer-events="none">${c}</g>`;
  }
  if ($('contract').checked) {
    s += `<g clip-path="url(#fl)" pointer-events="none"><path d="${EDGES.map(e => `M${P2(e.a)}L${P2(e.b)}`).join('')}" stroke="#fff" stroke-opacity="0.55" stroke-width="${BAND * 2}" stroke-linecap="round" fill="none"/></g>`;
    s += plan.exits.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.7" fill="#e53935"/>`).join('') + `<path d="${plan.half.map(e => `M${P2(e.a)}L${P2(e.b)}`).join('')}" stroke="#378add" stroke-width="0.4" fill="none"/>` + `<path d="${EDGES.filter(e => e.code === 'wall').map(e => `M${P2(e.a)}L${P2(e.b)}`).join('')}" stroke="#9b59b6" stroke-width="1.3" stroke-opacity="0.6" fill="none"/>`;
  }
  s += `<path d="${EDGES.filter(e => e.code !== 'wall').map(e => `M${P2(e.a)}L${P2(e.b)}`).join('')}" stroke="#5c4a33" stroke-width="0.25" fill="none" stroke-linecap="round"/>`;
  const party = EDGES.filter(e => e.code === 'wall').map(e => `M${P2(e.a)}L${P2(e.b)}`).join('');
  s += `<g filter="url(#wsh)" opacity="0.45" transform="translate(0.25,0.3)"><path d="${party}" stroke="#000" stroke-width="0.9" fill="none"/></g><path d="${party}" stroke="#3e3328" stroke-width="0.9" stroke-linecap="square" fill="none"/><path d="${party}" stroke="#8b7b66" stroke-width="0.68" stroke-dasharray="0.6 0.08" fill="none"/>`;
  svg.innerHTML = s;
  const cells = [...map.cells.values()];
  $('info').textContent = `зданий ${plan.buildings.length}, помещений ${plan.buildings.reduce((a, b) => a + b.rooms.length, 0)}\nклеток 1 м: ${cells.length}, стен ${cells.filter(c => c.wall).length}, дверей ${cells.filter(c => c.door).length}`;
}

// ---------- управление ----------
let vb = [-16, -16, 32, 32];
const setVB = () => svg.setAttribute('viewBox', vb.map(f2).join(' '));
const toMap = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
svg.addEventListener('wheel', ev => { ev.preventDefault(); const p = toMap(ev), f = Math.min(1.3, Math.max(0.12, vb[2] * Math.exp(ev.deltaY * 0.0015) / 32)) * 32 / vb[2];
  vb = [p.x + (vb[0] - p.x) * f, p.y + (vb[1] - p.y) * f, vb[2] * f, vb[3] * f]; setVB(); }, { passive: false });
let drag = null;
svg.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, vb: [...vb], moved: false }; svg.setPointerCapture(ev.pointerId); });
svg.addEventListener('pointermove', ev => { if (!drag) return; const r = svg.getBoundingClientRect(), dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; if (drag.moved) { vb[0] = drag.vb[0] - dx / r.width * vb[2]; vb[1] = drag.vb[1] - dy / r.height * vb[3]; setVB(); } });
svg.addEventListener('pointerup', ev => { if (drag && !drag.moved) { const p = toMap(ev), [q, r] = cellAt(p.x, p.y), c = map.cells.get(q + ',' + r); reach = c && !reach ? map.region(c) : null; draw(); } drag = null; });
for (const id of ['roofs', 'cells', 'contract']) $(id).addEventListener('change', draw);
$('variant').innerHTML = VARIANTS.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
$('open').addEventListener('change', load); $('seed').addEventListener('change', load); $('variant').addEventListener('change', load);
setVB(); load();
