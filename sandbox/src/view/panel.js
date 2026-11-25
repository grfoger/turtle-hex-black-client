// Панель управления: сид и размер мира, правила (вкл/выкл, порядок, параметры), типы дорог, правки, проверка стыков.
import { BIOMES } from '../world/biomes.js';
import { world } from '../world/config.js';
import { setSeed } from '../core/random.js';
import { getRules, resetCache, generateTop } from '../gen/engine.js';
import { EDITS } from '../gen/edits.js';
import { runSeamCheck } from '../checks/seams.js';
import { render, startView, clearSelection } from './map.js';

const $ = id => document.getElementById(id);

// пересоздать мир по текущему рецепту (кэш тайлов сбрасывается)
function regen(redrawRules = true) {
  setSeed(+$('seed').value | 0);
  resetCache(); generateTop(); if (redrawRules) renderRules(); render();
}
// новый мир: правки принадлежат миру, поэтому сбрасываются
function newWorld() { EDITS.clear(); clearSelection(); regen(false); startView(); render(); }

// ---- правила ----
const STAGES = [['top', 'Верхний уровень (видит всю карту)'], ['draft', 'Черновик (своя пачка + уровень выше)'], ['final', 'Итог (+ черновики соседей, только чтение)']];
function renderRules() {
  const RULES = getRules();
  $('rules').innerHTML = STAGES.map(([st, title]) => `<div class="stage">${title}</div>` + RULES.map((r, i) => r.stage !== st ? '' : `
    <div class="rule"><div class="head">
      <input type="checkbox" data-en="${i}" ${r.enabled || r.locked ? 'checked' : ''} ${r.locked ? 'disabled' : ''}>
      <span>${r.name}${r.locked ? ' <span class="meta">(базовое)</span>' : ''}</span>
      ${r.locked ? '' : `<button data-up="${i}">↑</button><button data-down="${i}">↓</button>`}</div>
      <div class="meta">${r.id}${r.ns !== r.id ? ' · data.' + r.ns : ''}${r.forbids ? ' · запрещает: ' + r.forbids.map(([a, b]) => BIOMES[a][0] + '–' + BIOMES[b][0]).join(', ') : ''}</div>
      ${r.params.map(p => `<label>${p.label} <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${r.values[p.key]}" data-r="${i}" data-k="${p.key}"><b>${r.values[p.key]}</b></label>`).join('')}
    </div>`).join('')).join('');
}
$('rules').addEventListener('input', e => {
  const d = e.target.dataset, RULES = getRules();
  if (d.en != null) RULES[+d.en].enabled = e.target.checked;
  if (d.r != null) { RULES[+d.r].values[d.k] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; }
  regen(false);
});
$('rules').addEventListener('click', e => {
  const d = e.target.dataset, RULES = getRules(), i = d.up != null ? +d.up : d.down != null ? +d.down : null; if (i == null) return;
  const dir = d.up != null ? -1 : 1; let j = i + dir;
  while (j >= 0 && j < RULES.length && RULES[j].stage !== RULES[i].stage) j += dir;
  if (j < 0 || j >= RULES.length || RULES[j].locked) return; // базовое правило всегда первое в своём этапе
  [RULES[i], RULES[j]] = [RULES[j], RULES[i]]; regen(true);
});

// ---- типы дорог (часть рецепта мира) и правки ----
function renderRoadTypes() {
  const T = world.roadTypes;
  fillEditTypes();
  $('roadTypes').innerHTML = T.map((t, i) => `<div class="rule" style="display:flex;gap:6px;align-items:center">${i + 1}. <input data-rt="${i}" data-f="name" value="${t.name}" style="width:110px"> ширина <input data-rt="${i}" data-f="w" type="number" min="0.5" step="0.5" value="${t.w}" style="width:60px"> м <button data-rdel="${i}" ${T.length < 2 ? 'disabled' : ''}>✕</button></div>`).join('') + '<button id="rtAdd">+ тип</button>';
}
$('roadTypes').addEventListener('change', e => { const d = e.target.dataset; if (d.rt == null) return; const t = world.roadTypes[+d.rt]; if (d.f === 'w') t.w = Math.max(0.5, +e.target.value || 1); else t.name = e.target.value || t.name; regen(false); });
$('roadTypes').addEventListener('click', e => {
  const d = e.target.dataset, T = world.roadTypes;
  if (d.rdel != null && T.length > 1) T.splice(+d.rdel, 1);
  else if (e.target.id === 'rtAdd') T.push({ name: 'Тип ' + (T.length + 1), w: Math.max(0.5, T[T.length - 1].w / 2) });
  else return;
  renderRoadTypes(); regen(false);
});
function fillEditTypes() { const el = $('editType'), v = el.value; el.innerHTML = world.roadTypes.map((t, i) => `<option value="${i}">${t.name} (${t.w} м)</option>`).join('') + '<option value="del">✕ Удалить отрезок</option>'; if ([...el.options].some(o => o.value === v)) el.value = v; }
$('editMode').onchange = () => { clearSelection(); render(); };
$('clearEdits').onclick = () => { EDITS.clear(); clearSelection(); regen(false); };

// ---- мир и проверка ----
$('seed').addEventListener('input', newWorld);
$('wrapN').addEventListener('change', e => { world.N = Math.max(6, Math.min(60, +e.target.value | 0)); newWorld(); });
$('rnd').onclick = () => { $('seed').value = Math.floor(Math.random() * 100000); newWorld(); };
$('checkBtn').onclick = () => {
  $('check').textContent = 'Проверяю…';
  setTimeout(() => {
    const s = runSeamCheck(), pairs = s.pairs.map(([a, b]) => BIOMES[a][0] + '–' + BIOMES[b][0]).join(', ') || 'нет';
    $('check').textContent = `Проверка: ${s.views} видов. Запрещённые соседства (${pairs}): ${s.total} (на стыках: ${s.border}). Разрывов рек/дорог: ${s.breaks}. Порядок открытия ${s.orderOk ? 'не влияет ✔' : 'ВЛИЯЕТ ✘'}`;
    render();
  }, 20);
};
$('legend').innerHTML = BIOMES.map(([n, c]) => `<div><span style="background:${c}"></span>${n}</div>`).join('') +
  '<div class="meta">Линии: синие — реки и ручьи (○ — родник), коричневые — дороги, толщина по типу (красный ● — поселение, крупнее = больше; коричневый ● — хутор)</div>';

export function initPanel() { renderRoadTypes(); regen(); startView(); render(); }
