// Прайс шиномонтажа TRUE DETAILING (из брифа, октябрь 2026). Цены в рублях.
const R = ['R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20', 'R21', 'R22', 'R23']
const byRadius = (values) => Object.fromEntries(R.map((r, i) => [r, values[i]]).filter(([, v]) => v != null))

// Комплексный шиномонтаж, за машину: класс → радиус → цена
export const COMPLEX = {
  II: byRadius([3000, 3000, 3200, 3400, 3600, 3800, 4200, 4700, 5000, 6000, 8000]),
  III: byRadius([3000, 3000, 3300, 3500, 3700, 3900, 4300, 4800, 5000, 6000, 8000]),
  IV: byRadius([3000, 3000, 3400, 3700, 4000, 4200, 4600, 5000, 5600, 6500, 8000]),
  V: byRadius([3000, 3000, 3700, 4200, 4300, 4600, 5000, 5300, 5800, 6700, 8000]),
  'Низкий профиль': byRadius([3700, 3700, 4300, 4800, 4800, 5000, 5400, 5700, 6300, 7100, 8000]),
}

// Услуги: unit — за что цена, qty — количество по умолчанию, from — цена «от»
export const SERVICES = [
  { name: 'Комплексный шиномонтаж', unit: 'машина', qty: 1, complex: true },
  { name: 'Снятие и установка', unit: 'колесо', qty: 4, prices: byRadius([300, 300, 300, 350, 350, 350, 350, 450, 450, 450, 450]) },
  { name: 'Монтаж', unit: 'колесо', qty: 4, prices: byRadius([250, 250, 300, 300, 300, 300, 350, 450, 450, 450, 450]) },
  { name: 'Демонтаж', unit: 'колесо', qty: 4, prices: byRadius([250, 250, 300, 300, 300, 300, 350, 450, 450, 450, 450]) },
  { name: 'Балансировка', unit: 'колесо', qty: 4, prices: byRadius([350, 350, 350, 400, 400, 450, 450, 500, 500, 500, 500]) },
  { name: 'Варка пореза', unit: 'колесо', qty: 1, from: true, prices: byRadius([1500, 1500, 1500, 1500, 1500, 1500, 2000, 2500, 2500, 2500, 2500]) },
  { name: 'Правка диска', unit: 'колесо', qty: 1, from: true, prices: byRadius([1500, 1500, 1900, 2000, 2100, 2400, 2900, 4000, 4000, 4000, 4000]) },
  { name: 'Камера', unit: 'колесо', qty: 1, prices: byRadius([1500, 1700, null, 1800]) },
  { name: 'Хранение 6 мес, без дисков', unit: 'комплект', qty: 1, prices: byRadius([null, 1800, 1800, 3000, 3000, 3600, 3600, 4200, 4200, 5400, 5400]) },
  { name: 'Хранение 6 мес, на дисках', unit: 'комплект', qty: 1, prices: byRadius([null, 2400, 2400, 3600, 3600, 4200, 4200, 4800, 4800, 6000, 6000]) },
  { name: 'Хранение 1 мес, без дисков', unit: 'комплект', qty: 1, prices: byRadius([null, 300, 300, 500, 500, 600, 600, 700, 700, 900, 900]) },
  { name: 'Хранение 1 мес, на дисках', unit: 'комплект', qty: 1, prices: byRadius([null, 400, 400, 600, 600, 700, 700, 800, 800, 1000, 1000]) },
  { name: 'Доплата Run Flat', unit: 'машина', qty: 1, fixed: 1000 },
  { name: 'Дошиповка', unit: 'шип', qty: 1, fixed: 35 },
  { name: 'Ремонт шины', unit: 'шт', qty: 1, fixed: 500, from: true },
  { name: 'Установка камеры', unit: 'шт', qty: 1, fixed: 200, from: true },
  { name: 'Замена вентиля', unit: 'шт', qty: 1, fixed: 200 },
  { name: 'Промазка диска герметиком', unit: 'шт', qty: 1, fixed: 150 },
  { name: 'Проверка шин / подкачка', unit: 'шт', qty: 1, fixed: 50 },
  { name: 'Установка жгута', unit: 'шт', qty: 1, fixed: 400 },
  { name: 'Установка грибка', unit: 'шт', qty: 1, fixed: 600, from: true },
  { name: 'Кордовая заплатка', unit: 'шт', qty: 1, fixed: 400, from: true },
  { name: 'Автомобиль свыше 3,5 тонн', unit: 'машина', qty: 1, fixed: 8000, from: true },
]

export const CLASSES = Object.keys(COMPLEX)
export const RADIUSES = R

// Цена за единицу или подсказка, почему её нет
export function unitPrice(service, cls, radius) {
  if (service.fixed != null) return { price: service.fixed }
  if (service.complex) {
    if (!cls) return { hint: 'выберите класс' }
    if (!radius) return { hint: 'выберите радиус' }
    const p = COMPLEX[cls]?.[radius]
    return p ? { price: p } : { hint: 'нет в прайсе' }
  }
  if (!radius) return { hint: 'выберите радиус' }
  const p = service.prices[radius]
  return p ? { price: p } : { hint: 'нет в прайсе' }
}
