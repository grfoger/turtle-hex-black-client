// Реестр биомов: всё о биоме — в одной записи. Новый биом = новая запись здесь (+ где он возникает в правилах рельефа).
// Индекс в списке хранится в тайлах (c.b) и участвует в хэшах — порядок записей не менять, новые добавлять в конец.
//   water       — водоём (реки в нём не текут линией, дороги не строятся на верхнем уровне)
//   inclusions  — какие пятна-вкрапления бывают внутри (порядок важен для случайного выбора)
//   travelCost  — стоимость прохода для прокладки дорог (нет — 2)
//   towns       — false: поселения верхнего уровня здесь не ставятся
//   wetness     — «влажность» для родников и ручьёв (нет — родников не бывает)
//   hamletRate  — частота хуторов (нет — хуторов не бывает)
//   icon        — значок на карте: путь SVG в квадрате ±0.6, цвет штриха, заливка, толщина
const LIST = [
  { id: 'sea', name: 'Морская вода', color: '#2f5f98', water: true, inclusions: ['meadow'],
    icon: { d: 'M-0.45,0.05 q0.15,-0.15 0.3,0 t0.3,0 t0.3,0', stroke: '#ffffff99' } },
  { id: 'fresh', name: 'Пресная вода', color: '#5b9bd5', water: true, inclusions: ['meadow'],
    icon: { d: 'M-0.35,0.05 q0.12,-0.12 0.23,0 t0.23,0 t0.23,0', stroke: '#ffffffaa' } },
  { id: 'meadow', name: 'Луга', color: '#b9d77a', inclusions: ['forest', 'fresh', 'hills', 'swamp'], travelCost: 1, wetness: 0.6, hamletRate: 1,
    icon: { d: 'M-0.3,0.25 l0.05,-0.25 M-0.2,0.25 l0.1,-0.3 M0.15,0.25 l0.05,-0.25 M0.25,0.25 l0.1,-0.2', stroke: '#4f7a2a' } },
  { id: 'forest', name: 'Лес', color: '#4f8a3c', inclusions: ['fresh', 'meadow', 'swamp', 'hills'], travelCost: 2, wetness: 1, hamletRate: 0.5,
    icon: { d: 'M0,-0.45 L0.3,0.15 L-0.3,0.15 Z M0,0.15 L0,0.4', stroke: '#1f4d16', fill: true } },
  { id: 'swamp', name: 'Болото', color: '#6f7f52', inclusions: ['fresh', 'forest'], travelCost: 4, wetness: 1.5, hamletRate: 0.15,
    icon: { d: 'M-0.3,0.3 L-0.3,-0.1 M-0.1,0.3 L-0.1,-0.25 M0.15,0.3 L0.15,-0.05 M-0.45,0.3 L0.45,0.3', stroke: '#38452a' } },
  { id: 'hills', name: 'Холмы', color: '#b49a64', inclusions: ['forest', 'meadow', 'mountains', 'fresh'], travelCost: 3, wetness: 1.2, hamletRate: 0.6,
    icon: { d: 'M-0.45,0.25 Q-0.2,-0.2 0.05,0.25 M-0.05,0.25 Q0.2,-0.1 0.45,0.25', stroke: '#6e5a33' } },
  { id: 'mountains', name: 'Горы', color: '#8a8580', inclusions: ['hills', 'fresh'], travelCost: 8, towns: false, wetness: 1.5, hamletRate: 0.1,
    icon: { d: 'M-0.5,0.3 L-0.15,-0.35 L0.05,0 L0.2,-0.2 L0.5,0.3 Z', stroke: '#3d3a36', fill: true } },
  { id: 'desert', name: 'Пустыня', color: '#e6d08a', inclusions: ['hills', 'meadow', 'fresh'], travelCost: 2, wetness: 0.05, hamletRate: 0.2,
    icon: { d: 'M-0.45,0.2 Q-0.2,0 0,0.2 Q0.2,0 0.45,0.2', stroke: '#a8904a' } },
  { id: 'shore', name: 'Берег', color: '#f3ead0', inclusions: ['meadow'], travelCost: 1, wetness: 0.3, hamletRate: 0.5,
    icon: { d: 'M-0.3,0.1 h0.01 M0,-0.1 h0.01 M0.25,0.15 h0.01 M-0.1,0.3 h0.01', stroke: '#b9ab86', width: 0.12 } },
  { id: 'road', name: 'Дорога', color: '#8d7b68', inclusions: [] },
];
// B.forest → индекс биома
export const B = Object.fromEntries(LIST.map((b, i) => [b.id, i]));
export const BIOMES = LIST.map(b => ({ ...b, inclusions: b.inclusions.map(id => B[id]) }));

export const SEA = B.sea, FRESH = B.fresh, SHORE = B.shore, ROAD = B.road;
export const WATER = new Set(BIOMES.flatMap((b, i) => b.water ? [i] : []));
// вода «как водоём»: пресная/морская клетка, не являющаяся полосой реки
export const isLakeOrSea = c => !!c && WATER.has(c.b) && !(c.data.rivers && c.data.rivers.band);
// биом «под» полосой реки/дороги — его видят дети при смешивании
export const groundOf = c => { if (!c) return SEA; for (const ns of ['roads', 'rivers']) { const d = c.data[ns]; if (d && d.band) return d.under; } return c.b; };
