// Проверки генератора без браузера: node sandbox/tests/run.mjs [--seams]
//  - эталонный снимок: хэш генерации должен совпасть с golden.json (рефакторинг без изменения поведения);
//  - --seams: дополнительно проверка стыков (запрещённые соседства, разрывы рек/дорог, порядок открытия).
import { readFile } from 'node:fs/promises';
import * as G from '../src/generator.js';
import { snapshot } from './snapshot.js';

const golden = JSON.parse(await readFile(new URL('./golden.json', import.meta.url), 'utf8'));
const api = { setSeed: G.setSeed, reset: () => { G.EDITS.clear(); G.resetCache(); G.generateTop(); }, topCells: G.getTopCells, getBatch: G.getBatch, editRoad: G.editRoad };
let t0 = performance.now();
const snap = snapshot(api);
const ok = snap.hash === golden.hash && snap.tiles === golden.tiles;
console.log(`снимок: ${snap.hash} (${snap.tiles} тайлов), эталон ${golden.hash} → ${ok ? 'совпадает ✔' : 'ОТЛИЧАЕТСЯ ✘'}  [${Math.round(performance.now() - t0)} мс]`);
let fail = !ok;
if (process.argv.includes('--seams')) {
  t0 = performance.now();
  const s = G.runSeamCheck();
  const good = s.total === 0 && s.breaks === 0 && s.orderOk;
  console.log(`стыки: ${s.views} видов, запрещённых соседств ${s.total} (на стыках ${s.border}), разрывов ${s.breaks}, порядок ${s.orderOk ? 'не влияет' : 'ВЛИЯЕТ'} → ${good ? '✔' : '✘'}  [${Math.round(performance.now() - t0)} мс]`);
  fail = fail || !good;
}
process.exit(fail ? 1 : 0);
