// Биомы: индекс → [название, цвет]. (Следующий шаг рефакторинга: реестр со свойствами вместо разбросанных таблиц.)
export const BIOMES = [
  ['Морская вода', '#2f5f98'], ['Пресная вода', '#5b9bd5'], ['Луга', '#b9d77a'], ['Лес', '#4f8a3c'],
  ['Болото', '#6f7f52'], ['Холмы', '#b49a64'], ['Горы', '#8a8580'], ['Пустыня', '#e6d08a'], ['Берег', '#f3ead0'],
  ['Дорога', '#8d7b68'],
];
export const SEA = 0, FRESH = 1, SHORE = 8, ROAD = 9;
export const WATER = new Set([SEA, FRESH]);
// вода «как водоём»: пресная/морская клетка, не являющаяся полосой реки
export const isLakeOrSea = c => !!c && WATER.has(c.b) && !(c.data.rivers && c.data.rivers.band);
// биом «под» полосой реки/дороги — его видят дети при смешивании
export const groundOf = c => { if (!c) return SEA; for (const ns of ['roads', 'rivers']) { const d = c.data[ns]; if (d && d.band) return d.under; } return c.b; };
// какие пятна-вкрапления бывают внутри биома
export const INCL = { 0: [2], 1: [2], 2: [3, 1, 5, 4], 3: [1, 2, 4, 5], 4: [1, 3], 5: [3, 2, 6, 1], 6: [5, 1], 7: [5, 2, 1], 8: [2], 9: [] };
