// Отрисовка клеток и их содержимого в SVG-строки. Только читает данные тайлов.
import { toPx } from '../core/hex.js';
import { SIZE, world } from '../world/config.js';
import { BIOMES, isLakeOrSea } from '../world/biomes.js';
import { portXY } from '../features/linear.js';
import { getRules } from '../gen/engine.js';

const ruleName = id => (getRules().find(r => r.id === id) || { name: id }).name;
export const statsHtml = st => Object.entries(st).filter(([, v]) => Object.keys(v).length).map(([id, v]) => `<div class="meta">${ruleName(id)}: ${Object.entries(v).map(([k, x]) => k + ' ' + x).join(', ')}</div>`).join('');
const short = data => JSON.stringify(data, (k, v) => k === 'pts' ? `[${v.length} точек]` : v);
export const cellText = (lvl, c, extra) => `Ур. ${lvl} (${SIZE[lvl]}) · ${extra} · ${BIOMES[c.b][0]}\ndata: ${short(c.data)}`;

// реки, дороги, поселения, родники: линия от точки стыковки на ребре к центру клетки
export function linearSvg(cells, ox, oy, lvl) {
  const ROAD_TYPES = world.roadTypes;
  let h = '';
  for (const ns of ['rivers', 'roads']) for (const c of cells) {
    const nd = c.data[ns]; if (!nd || !nd.ports) continue;
    const [cx, cy] = toPx(c.q, c.r);
    for (const p of (ns === 'rivers' && isLakeOrSea(c)) ? [] : nd.ports) { // в водоёме река не рисуется
      const [x, y] = portXY(c.q, c.r, p.e, p.s, 1), w = Math.min(0.7, Math.max(ns === 'rivers' ? 0.1 : 0.06 + (p.t != null ? 0.05 * Math.max(0, ROAD_TYPES.length - 2 - p.t) : 0.02), 2 * p.size / Math.pow(10, lvl))); // дороги: условная толщина по рангу
      h += `<line x1="${(x - ox).toFixed(3)}" y1="${(y - oy).toFixed(3)}" x2="${(cx - ox).toFixed(3)}" y2="${(cy - oy).toFixed(3)}" stroke="${ns === 'rivers' ? '#1f6fd1' : '#6b3d1f'}" stroke-width="${w.toFixed(3)}" stroke-linecap="round" pointer-events="none"/>`;
    }
    if (nd.town) h += `<circle cx="${(cx - ox).toFixed(3)}" cy="${(cy - oy).toFixed(3)}" r="${0.15 + 0.1 * nd.town}" fill="#c0392b" stroke="#fff" stroke-width="0.08" pointer-events="none"/>`;
    if (nd.hamlet) h += `<circle cx="${(cx - ox).toFixed(3)}" cy="${(cy - oy).toFixed(3)}" r="0.18" fill="#8a5a2b" stroke="#fff" stroke-width="0.06" pointer-events="none"/>`;
    if (nd.spring) h += `<circle cx="${(cx - ox).toFixed(3)}" cy="${(cy - oy).toFixed(3)}" r="0.22" fill="#fff" stroke="#1f6fd1" stroke-width="0.08" pointer-events="none"/>`;
  }
  return h;
}

// значки биомов (в квадрате ±0.6 вокруг центра клетки)
const ICONS = {
  0: 'M-0.45,0.05 q0.15,-0.15 0.3,0 t0.3,0 t0.3,0', 1: 'M-0.35,0.05 q0.12,-0.12 0.23,0 t0.23,0 t0.23,0',
  2: 'M-0.3,0.25 l0.05,-0.25 M-0.2,0.25 l0.1,-0.3 M0.15,0.25 l0.05,-0.25 M0.25,0.25 l0.1,-0.2',
  3: 'M0,-0.45 L0.3,0.15 L-0.3,0.15 Z M0,0.15 L0,0.4', 4: 'M-0.3,0.3 L-0.3,-0.1 M-0.1,0.3 L-0.1,-0.25 M0.15,0.3 L0.15,-0.05 M-0.45,0.3 L0.45,0.3',
  5: 'M-0.45,0.25 Q-0.2,-0.2 0.05,0.25 M-0.05,0.25 Q0.2,-0.1 0.45,0.25', 6: 'M-0.5,0.3 L-0.15,-0.35 L0.05,0 L0.2,-0.2 L0.5,0.3 Z',
  7: 'M-0.45,0.2 Q-0.2,0 0,0.2 Q0.2,0 0.45,0.2', 8: 'M-0.3,0.1 h0.01 M0,-0.1 h0.01 M0.25,0.15 h0.01 M-0.1,0.3 h0.01',
};
const ICON_STYLE = { 0: '#ffffff99', 1: '#ffffffaa', 2: '#4f7a2a', 3: '#1f4d16', 4: '#38452a', 5: '#6e5a33', 6: '#3d3a36', 7: '#a8904a', 8: '#b9ab86' };
export function iconsSvg(cells, ox, oy) {
  return cells.map(c => ICONS[c.b] ? `<path d="${ICONS[c.b]}" transform="translate(${(c.x - ox).toFixed(3)},${(c.y - oy).toFixed(3)})" fill="${c.b === 3 || c.b === 6 ? ICON_STYLE[c.b] : 'none'}" stroke="${ICON_STYLE[c.b]}" stroke-width="${c.b === 8 ? 0.12 : 0.06}" stroke-linecap="round" pointer-events="none"/>` : '').join('');
}
