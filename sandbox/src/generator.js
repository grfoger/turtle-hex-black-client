// Точка входа генератора (без DOM): собирает движок, правила и слой правок. Её подключают и песочница, и тесты в node.
import { setRules, setOverlay, setGround } from './gen/engine.js';
import { groundOf } from './features/linear.js';
import { applyEdits } from './gen/edits.js';
import { RULES } from './rules.js';

setRules(RULES);
setOverlay(applyEdits);
setGround(groundOf);

export { RULES };
export { setSeed, getSeed } from './core/random.js';
export { TOP, SIZE, world } from './world/config.js';
export { resetCache, generateTop, getTopCells, getTopStats, getCell, getDraft, getBatch, getRules } from './gen/engine.js';
export { EDITS, applyEdits, editRoad } from './gen/edits.js';
export { countViolations, runSeamCheck, forbiddenPairs } from './checks/seams.js';
