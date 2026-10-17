// Прайс-листы. У каждого подразделения свой список позиций, редактируется в Настройках.
// Позиция: { id, name, unit, qty, kind, price | prices | matrix, from }
//  kind 'fixed'        — одна цена (price)
//  kind 'radius'       — цена по радиусу (prices: { R16: 350, ... })
//  kind 'class_radius' — цена по классу и радиусу (matrix: { III: { R16: 3500 } })
//  qty — количество по умолчанию (колёса — 4), from — цена «от»
import { RADII } from './lib.js'

const byRadius = (values) => Object.fromEntries(RADII.map((r, i) => [r, values[i]]).filter(([, v]) => v != null))

export const PRICE_CLASSES = ['II', 'III', 'IV', 'V', 'Низкий профиль']

// Прайс шиномонтажа TRUE DETAILING из брифа (октябрь 2026)
const TIRES = [
  {
    id: 'complex', name: 'Комплексный шиномонтаж', unit: 'машина', qty: 1, kind: 'class_radius',
    matrix: {
      II: byRadius([3000, 3000, 3200, 3400, 3600, 3800, 4200, 4700, 5000, 6000, 8000]),
      III: byRadius([3000, 3000, 3300, 3500, 3700, 3900, 4300, 4800, 5000, 6000, 8000]),
      IV: byRadius([3000, 3000, 3400, 3700, 4000, 4200, 4600, 5000, 5600, 6500, 8000]),
      V: byRadius([3000, 3000, 3700, 4200, 4300, 4600, 5000, 5300, 5800, 6700, 8000]),
      'Низкий профиль': byRadius([3700, 3700, 4300, 4800, 4800, 5000, 5400, 5700, 6300, 7100, 8000]),
    },
  },
  { id: 'wheel', name: 'Снятие и установка', unit: 'колесо', qty: 4, kind: 'radius', prices: byRadius([300, 300, 300, 350, 350, 350, 350, 450, 450, 450, 450]) },
  { id: 'mount', name: 'Монтаж', unit: 'колесо', qty: 4, kind: 'radius', prices: byRadius([250, 250, 300, 300, 300, 300, 350, 450, 450, 450, 450]) },
  { id: 'dismount', name: 'Демонтаж', unit: 'колесо', qty: 4, kind: 'radius', prices: byRadius([250, 250, 300, 300, 300, 300, 350, 450, 450, 450, 450]) },
  { id: 'balance', name: 'Балансировка', unit: 'колесо', qty: 4, kind: 'radius', prices: byRadius([350, 350, 350, 400, 400, 450, 450, 500, 500, 500, 500]) },
  { id: 'cut', name: 'Варка пореза', unit: 'колесо', qty: 1, kind: 'radius', from: true, prices: byRadius([1500, 1500, 1500, 1500, 1500, 1500, 2000, 2500, 2500, 2500, 2500]) },
  { id: 'disc', name: 'Правка диска', unit: 'колесо', qty: 1, kind: 'radius', from: true, prices: byRadius([1500, 1500, 1900, 2000, 2100, 2400, 2900, 4000, 4000, 4000, 4000]) },
  { id: 'tube', name: 'Камера', unit: 'колесо', qty: 1, kind: 'radius', prices: byRadius([1500, 1700, null, 1800]) },
  { id: 'store6', name: 'Хранение 6 мес, без дисков', unit: 'комплект', qty: 1, kind: 'radius', prices: byRadius([null, 1800, 1800, 3000, 3000, 3600, 3600, 4200, 4200, 5400, 5400]) },
  { id: 'store6d', name: 'Хранение 6 мес, на дисках', unit: 'комплект', qty: 1, kind: 'radius', prices: byRadius([null, 2400, 2400, 3600, 3600, 4200, 4200, 4800, 4800, 6000, 6000]) },
  { id: 'store1', name: 'Хранение 1 мес, без дисков', unit: 'комплект', qty: 1, kind: 'radius', prices: byRadius([null, 300, 300, 500, 500, 600, 600, 700, 700, 900, 900]) },
  { id: 'store1d', name: 'Хранение 1 мес, на дисках', unit: 'комплект', qty: 1, kind: 'radius', prices: byRadius([null, 400, 400, 600, 600, 700, 700, 800, 800, 1000, 1000]) },
  { id: 'runflat', name: 'Доплата Run Flat', unit: 'машина', qty: 1, kind: 'fixed', price: 1000 },
  { id: 'stud', name: 'Дошиповка', unit: 'шип', qty: 1, kind: 'fixed', price: 35 },
  { id: 'repair', name: 'Ремонт шины', unit: 'шт', qty: 1, kind: 'fixed', price: 500, from: true },
  { id: 'tubeset', name: 'Установка камеры', unit: 'шт', qty: 1, kind: 'fixed', price: 200, from: true },
  { id: 'valve', name: 'Замена вентиля', unit: 'шт', qty: 1, kind: 'fixed', price: 200 },
  { id: 'seal', name: 'Промазка диска герметиком', unit: 'шт', qty: 1, kind: 'fixed', price: 150 },
  { id: 'check', name: 'Проверка шин / подкачка', unit: 'шт', qty: 1, kind: 'fixed', price: 50 },
  { id: 'plug', name: 'Установка жгута', unit: 'шт', qty: 1, kind: 'fixed', price: 400 },
  { id: 'mushroom', name: 'Установка грибка', unit: 'шт', qty: 1, kind: 'fixed', price: 600, from: true },
  { id: 'patch', name: 'Кордовая заплатка', unit: 'шт', qty: 1, kind: 'fixed', price: 400, from: true },
  { id: 'heavy', name: 'Автомобиль свыше 3,5 тонн', unit: 'машина', qty: 1, kind: 'fixed', price: 8000, from: true },
]

export const DEFAULT_PRICELISTS = { tires: TIRES, wash: [], service: [], detailing: [], anticor: [] }

// Цена за единицу или подсказка, почему её нет
export function unitPrice(item, cls, radius) {
  if (item.kind === 'fixed') return item.price != null && item.price !== '' ? { price: Number(item.price) } : { hint: 'нет цены' }
  if (item.kind === 'class_radius') {
    if (!cls) return { hint: 'выберите класс' }
    if (!radius) return { hint: 'выберите радиус' }
    const p = item.matrix?.[cls]?.[radius]
    return p ? { price: Number(p) } : { hint: 'нет в прайсе' }
  }
  if (!radius) return { hint: 'выберите радиус' }
  const p = item.prices?.[radius]
  return p ? { price: Number(p) } : { hint: 'нет в прайсе' }
}

// Строка заявки: { item_id, name, qty, price, own } — own: цена вписана вручную и не пересчитывается
export function lineFromItem(item, cls, radius) {
  return { item_id: item.id, name: item.name, qty: item.qty || 1, price: unitPrice(item, cls, radius).price ?? null, own: false, from: !!item.from }
}

// Пересчитать цены строк после смены класса/радиуса (кроме вписанных вручную)
export function repriceLines(lines, list, cls, radius) {
  return lines.map((l) => {
    if (l.own) return l
    const item = list.find((i) => i.id === l.item_id)
    return item ? { ...l, price: unitPrice(item, cls, radius).price ?? null } : l
  })
}

export const lineSum = (l) => (l.price != null ? Number(l.price) * (Number(l.qty) || 0) : 0)
export const linesTotal = (lines) => (lines || []).reduce((a, l) => a + lineSum(l), 0)
export const rub = (n) => `${Math.round(n || 0).toLocaleString('ru-RU')} ₽`
