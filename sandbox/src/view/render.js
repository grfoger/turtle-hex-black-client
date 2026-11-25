// Отрисовка клеток и их содержимого в SVG-строки. Только читает данные тайлов.
import { toPx } from '../core/hex.js';
import { SIZE, world } from '../world/config.js';
import { BIOMES } from '../world/biomes.js';
import { portXY, isLakeOrSea } from '../features/linear.js';
import { getRules } from '../gen/engine.js';

const ruleName = id => (getRules().find(r => r.id === id) || { name: id }).name;
export const statsHtml = st => Object.entries(st).filter(([, v]) => Object.keys(v).length).map(([id, v]) => `<div class="meta">${ruleName(id)}: ${Object.entries(v).map(([k, x]) => k + ' ' + x).join(', ')}</div>`).join('');
const short = data => JSON.stringify(data, (k, v) => k === 'pts' ? `[${v.length} точек]` : v);
export const cellText = (lvl, c, extra) => `Ур. ${lvl} (${SIZE[lvl]}) · ${extra} · ${BIOMES[c.b].name}\ndata: ${short(c.data)}`;

// как рисовать линии каждого вида: цвет, минимальная толщина, скрывать ли в водоёме
const LINE_STYLE = {
  rivers: { color: '#1f6fd1', minW: () => 0.1, hideInWater: true },
  roads: { color: '#6b3d1f', minW: p => 0.06 + (p.t != null ? 0.05 * Math.max(0, world.roadTypes.length - 2 - p.t) : 0.02) }, // условная толщина по рангу
};
// реки, дороги, поселения, родники: линия от точки стыковки на ребре к центру клетки
export function linearSvg(cells, ox, oy, lvl) {
  let h = '';
  for (const [ns, st] of Object.entries(LINE_STYLE)) for (const c of cells) {
    const nd = c.data[ns]; if (!nd || !nd.ports) continue;
    const [cx, cy] = toPx(c.q, c.r);
    for (const p of (st.hideInWater && isLakeOrSea(c)) ? [] : nd.ports) {
      const [x, y] = portXY(c.q, c.r, p.e, p.s, 1), w = Math.min(0.7, Math.max(st.minW(p), 2 * p.size / Math.pow(10, lvl)));
      h += `<line x1="${(x - ox).toFixed(3)}" y1="${(y - oy).toFixed(3)}" x2="${(cx - ox).toFixed(3)}" y2="${(cy - oy).toFixed(3)}" stroke="${st.color}" stroke-width="${w.toFixed(3)}" stroke-linecap="round" pointer-events="none"/>`;
    }
    if (nd.town) h += `<circle cx="${(cx - ox).toFixed(3)}" cy="${(cy - oy).toFixed(3)}" r="${0.15 + 0.1 * nd.town}" fill="#c0392b" stroke="#fff" stroke-width="0.08" pointer-events="none"/>`;
    if (nd.hamlet) h += `<circle cx="${(cx - ox).toFixed(3)}" cy="${(cy - oy).toFixed(3)}" r="0.18" fill="#8a5a2b" stroke="#fff" stroke-width="0.06" pointer-events="none"/>`;
    if (nd.spring) h += `<circle cx="${(cx - ox).toFixed(3)}" cy="${(cy - oy).toFixed(3)}" r="0.22" fill="#fff" stroke="#1f6fd1" stroke-width="0.08" pointer-events="none"/>`;
  }
  return h;
}

// значки биомов (описаны в реестре биомов)
export function iconsSvg(cells, ox, oy) {
  return cells.map(c => { const ic = BIOMES[c.b].icon; return ic ? `<path d="${ic.d}" transform="translate(${(c.x - ox).toFixed(3)},${(c.y - oy).toFixed(3)})" fill="${ic.fill ? ic.stroke : 'none'}" stroke="${ic.stroke}" stroke-width="${ic.width || 0.06}" stroke-linecap="round" pointer-events="none"/>` : ''; }).join('');
}
