// Редактор паркета квартала: 100 гексов 10 м, каждый — в группе целиком или ровно половинкой (разрез через противоположные вершины).
// Проверки: площади групп, острые углы (60°), связность групп, незанятые гексы. Раскладка — в localStorage и в JSON-файл.
import { CHILD_OFFSETS } from '../core/hex.js';

const $ = id => document.getElementById(id), svg = $('svg'), S3 = Math.sqrt(3);
const toPx = (q, r) => [1.5 * q, S3 * (r + q / 2)], hexNorm = (x, y, s) => Math.max(Math.abs(y) / (s * S3 / 2), (S3 * Math.abs(x) + Math.abs(y)) / (s * S3));
const PAL = ['#f6c26b', '#8fd3bf', '#f2a98f', '#a9a2ea', '#b7d98a', '#f1a8c4', '#9cc7f0', '#e8d36b', '#c9b49a', '#7fc8d8', '#e7a35c', '#b9e0a5', '#d7a8e3', '#f5d0a9', '#a3b8d9', '#e0c3c3'];
const KEY = 'parquet-editor-v1';

// ---- геометрия ----
const cells = CHILD_OFFSETS.map(([q, r]) => ({ q, r, c: toPx(q, r) })), N = cells.length;
const idx = new Map(cells.map((c, i) => [c.q + ',' + c.r, i]));
const V = (c, t) => [c[0] + Math.cos(Math.PI / 3 * t), c[1] + Math.sin(Math.PI / 3 * t)];
// сосед через ребро t (между вершинами t и t+1)
const NB = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const nbOf = (i, t) => idx.get((cells[i].q + NB[t][0]) + ',' + (cells[i].r + NB[t][1]));
// соседние краевые гексы и точки выходов (для ориентира)
const own = new Set(cells.map(c => c.q + ',' + c.r)), edgeNb = [];
for (let q = -7; q <= 7; q++) for (let r = -7; r <= 7; r++) { const p = toPx(q, r); if (!own.has(q + ',' + r) && Math.abs(hexNorm(p[0], p[1], 10) - 1) < 1e-6) edgeNb.push(p); }
const exits = [...cells.map(c => c.c), ...edgeNb].filter(p => Math.abs(hexNorm(p[0], p[1], 10) - 1) < 1e-6);
// точки решётки: 6 секторов по кругу → [гекс, треугольник] или null (снаружи квартала)
const kk = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000), PTS = new Map();
cells.forEach((cl, i) => { for (let t = 0; t < 6; t++) {
  const add = (pt, ang) => { const k = kk(...pt); if (!PTS.has(k)) PTS.set(k, { p: pt, ring: Array(6).fill(null) }); const sec = ((Math.floor(((ang + 4 * Math.PI) % (2 * Math.PI)) / (Math.PI / 3) + 1e-9)) % 6 + 6) % 6; PTS.get(k).ring[sec] = [i, t]; };
  const g = [cl.c[0] + 0.55 * Math.cos(Math.PI / 3 * (t + 0.5)), cl.c[1] + 0.55 * Math.sin(Math.PI / 3 * (t + 0.5))];
  add(cl.c, Math.PI / 3 * (t + 0.5));
  for (const vt of [t, t + 1]) { const v = V(cl.c, vt); add(v, Math.atan2(g[1] - v[1], g[0] - v[0])); }
} });

// ---- состояние: для гекса — split (-1 целиком, 0..2 — разрез через вершины split и split+3), a — группа первой половины (сектора split..split+2), b — второй ----
let groups = [{ name: 'Группа 1' }], cur = 0, tool = 'whole';
let st = cells.map(() => ({ split: -1, a: -1, b: -1 }));
const undoStack = [];
const pieceOf = (i, t) => { const s = st[i]; return s.split < 0 ? s.a : (((t - s.split + 6) % 6) < 3 ? s.a : s.b); };
const snapshot = () => JSON.stringify({ groups, st });
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 200) undoStack.shift(); }
function restore(json) { const d = JSON.parse(json); groups = d.groups; st = d.st; if (cur >= groups.length) cur = 0; }
function save() { try { localStorage.setItem(KEY, snapshot()); } catch (e) { /* хранилище недоступно — не страшно */ } }

// ---- правки ----
function setWhole(i, g) { st[i] = { split: -1, a: g, b: g }; }
// половинка с центром в треугольнике t: сектора t-1, t, t+1 → в группу g; вторая половина — как была (большинство её треугольников)
function setHalf(i, t, g) {
  const start = (t + 5) % 6, other = [3, 4, 5].map(k => pieceOf(i, (start + k) % 6));
  const keep = other.sort((x, y) => other.filter(v => v === y).length - other.filter(v => v === x).length)[0];
  // разрез через вершины start и start+3: split = start % 3; первая половина (сектора split..split+2)
  const split = start % 3, firstIsOurs = start === split;
  st[i] = { split, a: firstIsOurs ? g : keep, b: firstIsOurs ? keep : g };
  if (st[i].a === st[i].b) st[i] = { split: -1, a: g === keep ? g : st[i].a, b: st[i].a };
}

// ---- проверки ----
function analyze() {
  const area = groups.map(() => 0); let free = 0;
  cells.forEach((_, i) => { for (let t = 0; t < 6; t++) { const p = pieceOf(i, t); if (p >= 0) area[p] += 1 / 6; else free += 1 / 6; } });
  const acute = [];
  for (const pt of PTS.values()) { const pc = pt.ring.map(x => x ? pieceOf(...x) : null);
    if (pc.filter(x => x !== null).every(x => x === pc.find(y => y !== null))) continue;
    for (let s = 0; s < 6; s++) { const x = pc[s]; if (x === null || x < 0) continue; if (pc[(s + 1) % 6] !== x && pc[(s + 5) % 6] !== x) { acute.push(pt.p); break; } } }
  // связность групп по треугольникам (соседи: внутри гекса и через ребро)
  const broken = [];
  groups.forEach((_, g) => { const tris = []; cells.forEach((_, i) => { for (let t = 0; t < 6; t++) if (pieceOf(i, t) === g) tris.push(i * 6 + t); });
    if (!tris.length) return; const set = new Set(tris), seen = new Set([tris[0]]), stack = [tris[0]];
    while (stack.length) { const x = stack.pop(), i = Math.floor(x / 6), t = x % 6, nbs = [i * 6 + (t + 1) % 6, i * 6 + (t + 5) % 6]; const n = nbOf(i, t); if (n !== undefined) nbs.push(n * 6 + (t + 3) % 6);
      for (const y of nbs) if (set.has(y) && !seen.has(y)) { seen.add(y); stack.push(y); } }
    if (seen.size < set.size) broken.push(g); });
  const halves = st.filter(s => s.split >= 0).length;
  return { area, free, acute, broken, halves };
}

// ---- отрисовка ----
const f = v => v.toFixed(3), P2 = p => f(p[0]) + ',' + f(p[1]);
function draw() {
  const A = analyze(); let s = '';
  // соседние краевые гексы — пунктиром
  s += `<path d="${edgeNb.map(c => 'M' + [0, 1, 2, 3, 4, 5].map(t => P2(V(c, t))).join('L') + 'Z').join('')}" fill="none" stroke="#bbb" stroke-width="0.04" stroke-dasharray="0.15 0.1"/>`;
  // треугольники (заливка группы)
  cells.forEach((cl, i) => { for (let t = 0; t < 6; t++) { const p = pieceOf(i, t);
    s += `<polygon points="${P2(cl.c)} ${P2(V(cl.c, t))} ${P2(V(cl.c, t + 1))}" fill="${p >= 0 ? PAL[p % PAL.length] : '#fafafa'}" stroke="${$('tris').checked ? '#0002' : (p >= 0 ? PAL[p % PAL.length] : '#fafafa')}" stroke-width="0.025" data-i="${i}" data-t="${t}"/>`; } });
  // контуры гексов (тонко) и границы групп (толсто)
  let hex = '', bd = '', out = '';
  cells.forEach((cl, i) => { for (let t = 0; t < 6; t++) { const a = V(cl.c, t), b = V(cl.c, t + 1), n = nbOf(i, t); hex += `M${P2(a)}L${P2(b)}`;
      if (n === undefined) out += `M${P2(a)}L${P2(b)}`; else if (n > i && pieceOf(n, (t + 3) % 6) !== pieceOf(i, t)) bd += `M${P2(a)}L${P2(b)}`; }
    const s0 = st[i]; if (s0.split >= 0 && s0.a !== s0.b) bd += `M${P2(V(cl.c, s0.split))}L${P2(V(cl.c, s0.split + 3))}`; });
  s += `<path d="${hex}" fill="none" stroke="#0004" stroke-width="0.05" pointer-events="none"/><path d="${bd}" fill="none" stroke="#222" stroke-width="0.16" stroke-linecap="round" pointer-events="none"/><path d="${out}" fill="none" stroke="#000" stroke-width="0.22" stroke-linecap="round" pointer-events="none"/>`;
  s += exits.map(p => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.18" fill="none" stroke="#c62828" stroke-width="0.05" pointer-events="none"/>`).join('');
  if ($('marks').checked) {
    s += A.acute.map(p => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.22" fill="#e53935" stroke="#fff" stroke-width="0.05" pointer-events="none"/>`).join('');
    // подписи площадей в центрах групп; разорванные группы — оранжевой рамкой
    groups.forEach((g, gi) => { let sx = 0, sy = 0, n = 0; cells.forEach((cl, i) => { for (let t = 0; t < 6; t++) if (pieceOf(i, t) === gi) { sx += cl.c[0] + 0.5 * Math.cos(Math.PI / 3 * (t + 0.5)); sy += cl.c[1] + 0.5 * Math.sin(Math.PI / 3 * (t + 0.5)); n++; } });
      if (n) s += `<text x="${f(sx / n)}" y="${f(sy / n)}" font-size="0.75" text-anchor="middle" dominant-baseline="middle" fill="${A.broken.includes(gi) ? '#e65100' : '#222'}" stroke="#fff" stroke-width="0.12" paint-order="stroke" pointer-events="none">${gi + 1}: ${+A.area[gi].toFixed(2)}</text>`; });
  }
  svg.innerHTML = s;
  // панель групп
  $('groups').innerHTML = groups.map((g, gi) => `<div class="g ${gi === cur ? 'on' : ''}" data-g="${gi}"><span class="sw" style="background:${PAL[gi % PAL.length]}"></span>${g.name}<span style="margin-left:auto">${+A.area[gi].toFixed(2)} гекс. · ${Math.round(A.area[gi] * 86.6)} м²</span></div>`).join('');
  const used = A.area.filter(a => a > 0), mn = Math.min(...used), mx = Math.max(...used);
  $('check').innerHTML = `групп с гексами: ${used.length}, площади от ${used.length ? +mn.toFixed(2) : 0} до ${used.length ? +mx.toFixed(2) : 0} гекса\n` +
    `не занято: <span class="${A.free > 0.01 ? 'bad' : 'ok'}">${+A.free.toFixed(2)} гекса</span>\n` +
    `острых углов: <span class="${A.acute.length ? 'bad' : 'ok'}">${A.acute.length}</span>\n` +
    `разорванных групп: <span class="${A.broken.length ? 'bad' : 'ok'}">${A.broken.length ? A.broken.map(g => g + 1).join(', ') : 0}</span>\n` +
    `гексов пополам: ${A.halves}`;
  save();
}

// ---- рисование мышью ----
let painting = false, lastKey = '';
function apply(el) {
  if (!el || el.dataset.i === undefined) return;
  const i = +el.dataset.i, t = +el.dataset.t, key = tool + i + ':' + t + ':' + cur; if (key === lastKey) return; lastKey = key;
  if (tool === 'pick') { const p = pieceOf(i, t); if (p >= 0) { cur = p; draw(); } return; }
  if (tool === 'whole') setWhole(i, cur); else if (tool === 'erase') setWhole(i, -1); else if (tool === 'half') setHalf(i, t, cur);
  draw();
}
svg.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; pushUndo(); painting = tool !== 'half' && tool !== 'pick'; lastKey = ''; apply(ev.target); });
svg.addEventListener('pointermove', ev => { if (painting) apply(document.elementFromPoint(ev.clientX, ev.clientY)); });
window.addEventListener('pointerup', () => { painting = false; });

// ---- панели ----
const setTool = t => { tool = t; document.querySelectorAll('.tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); };
document.querySelectorAll('.tools button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('groups').addEventListener('click', ev => { const g = ev.target.closest('.g'); if (g) { cur = +g.dataset.g; draw(); } });
$('addGroup').addEventListener('click', () => { pushUndo(); groups.push({ name: 'Группа ' + (groups.length + 1) }); cur = groups.length - 1; draw(); });
$('undo').addEventListener('click', () => { if (undoStack.length) { restore(undoStack.pop()); draw(); } });
window.addEventListener('keydown', ev => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); $('undo').click(); }
  else if (['1', '2', '3', '4'].includes(ev.key) && ev.target.tagName !== 'INPUT') setTool(['whole', 'half', 'pick', 'erase'][+ev.key - 1]);
});
$('tris').addEventListener('change', draw); $('marks').addEventListener('change', draw);
$('clear').addEventListener('click', () => { pushUndo(); st = cells.map(() => ({ split: -1, a: -1, b: -1 })); draw(); });
// заготовка: K групп «по ближайшей затравке» (затравки — дальним выбором), только целые гексы
$('voronoi').addEventListener('click', () => { pushUndo(); const K = Math.max(2, Math.min(30, +$('vk').value || 10));
  const seeds = [cells.findIndex(c => !c.q && !c.r)];
  while (seeds.length < K) { let bi = 0, bd = -1; cells.forEach((c, i) => { const d = Math.min(...seeds.map(s => Math.hypot(c.c[0] - cells[s].c[0], c.c[1] - cells[s].c[1]))); if (d > bd) { bd = d; bi = i; } }); seeds.push(bi); }
  groups = seeds.map((_, g) => ({ name: 'Группа ' + (g + 1) }));
  st = cells.map(c => { let bg = 0, bd = 1e9; seeds.forEach((s, g) => { const d = Math.hypot(c.c[0] - cells[s].c[0], c.c[1] - cells[s].c[1]); if (d < bd - 1e-9) { bd = d; bg = g; } }); return { split: -1, a: bg, b: bg }; });
  cur = 0; draw(); });
$('save').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ format: 'quarter-parquet-v1', groups, cells: cells.map((c, i) => ({ q: c.q, r: c.r, ...st[i] })) }, null, 1)], { type: 'application/json' })); a.download = 'parquet.json'; a.click(); });
$('load').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async () => { const fl = $('file').files[0]; if (!fl) return; try { const d = JSON.parse(await fl.text()); pushUndo(); groups = d.groups;
  st = cells.map(c => { const x = d.cells.find(y => y.q === c.q && y.r === c.r); return x ? { split: x.split, a: x.a, b: x.b } : { split: -1, a: -1, b: -1 }; }); cur = 0; draw(); } catch (e) { alert('Не удалось прочитать файл: ' + e.message); } $('file').value = ''; });

// ---- старт ----
svg.setAttribute('viewBox', '-11.2 -10.6 22.4 21.2');
try { const s = localStorage.getItem(KEY); if (s) restore(s); } catch (e) { /* нет сохранения */ }
draw();
