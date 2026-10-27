// Хранение шин: склады (контейнеры), стеллажи и ячейки, комплекты на хранении. Чистые функции — покрыты тестами.
import { normalizePhone, today } from './lib.js'

export const SEASONS = {
  winter: { label: 'Зима', short: 'З', color: '#3ba4f0' },
  summer: { label: 'Лето', short: 'Л', color: '#f2a516' },
}

// Склад — контейнер или помещение. Стеллаж: секции по горизонтали × ярусы по вертикали, в ячейке capacity комплектов
export const DEFAULT_WAREHOUSES = [
  {
    id: 'c1',
    name: 'Контейнер 1',
    racks: [
      { id: 'a', name: 'А', sections: 5, levels: 3, capacity: 1 },
      { id: 'b', name: 'Б', sections: 5, levels: 3, capacity: 1 },
    ],
  },
]

export const newRack = (racks) => {
  const letters = 'АБВГДЕЖИКЛМНПРСТ'
  const used = new Set(racks.map((r) => r.name))
  const name = [...letters].find((l) => !used.has(l)) || String(racks.length + 1)
  return { id: Math.random().toString(36).slice(2, 8), name, sections: 5, levels: 3, capacity: 1 }
}

export const cellKey = (s) => `${s.warehouse_id}:${s.rack_id}:${s.section}:${s.level}`
export const isStored = (s) => s.status !== 'issued'

// «А-2-3»: стеллаж, секция, ярус
export const cellName = (rack, section, level) => `${rack?.name ?? '?'}-${section}-${level}`
export function locationOf(s, warehouses) {
  const w = warehouses.find((x) => x.id === s.warehouse_id)
  const r = w?.racks.find((x) => x.id === s.rack_id)
  return { warehouse: w, rack: r, cell: cellName(r, s.section, s.level), full: `${w?.name ?? 'Склад удалён'} · ${cellName(r, s.section, s.level)}` }
}

export const formatNum = (n) => String(n || 0).padStart(4, '0')
export const nextNum = (sets) => sets.reduce((m, s) => Math.max(m, s.num || 0), 0) + 1

// Комплекты, которые сейчас лежат в каждой ячейке: { ключ ячейки: [комплекты] }
export function occupancy(sets) {
  const out = {}
  for (const s of sets) if (isStored(s) && s.warehouse_id) (out[cellKey(s)] ||= []).push(s)
  return out
}

export const cellsOf = (w) => w.racks.reduce((n, r) => n + r.sections * r.levels * (r.capacity || 1), 0)

// Сколько мест занято на складе и сколько комплектов какого сезона
export function warehouseStats(w, sets) {
  const here = sets.filter((s) => isStored(s) && s.warehouse_id === w.id)
  return {
    total: cellsOf(w),
    used: here.length,
    winter: here.filter((s) => s.season === 'winter').length,
    summer: here.filter((s) => s.season === 'summer').length,
  }
}

// Ячейка свободна, если в ней меньше комплектов, чем помещается (свой комплект не считаем)
export function cellFree(sets, w, rack, section, level, exceptId) {
  const n = sets.filter(
    (s) => isStored(s) && s.id !== exceptId && s.warehouse_id === w.id && s.rack_id === rack.id && s.section === section && s.level === level,
  ).length
  return n < (rack.capacity || 1)
}

// Первая свободная ячейка: снизу вверх, слева направо — нижние ярусы удобнее
export function firstFreeCell(sets, warehouses, preferId) {
  const list = preferId ? [...warehouses.filter((w) => w.id === preferId), ...warehouses.filter((w) => w.id !== preferId)] : warehouses
  for (const w of list)
    for (const r of w.racks)
      for (let level = 1; level <= r.levels; level++)
        for (let section = 1; section <= r.sections; section++)
          if (cellFree(sets, w, r, section, level)) return { warehouse_id: w.id, rack_id: r.id, section, level }
  return null
}

// Срок хранения вышел — пора звонить клиенту
export const overdue = (s, day = today()) => isStored(s) && !!s.until && s.until < day

export function searchSets(sets, q) {
  const s = q.trim().toLowerCase()
  if (!s) return sets
  const digits = s.replace(/\D/g, '')
  return sets.filter(
    (x) =>
      formatNum(x.num).includes(s.replace(/^№\s*/, '')) ||
      [x.car, x.client_name, x.brand, x.size].some((v) => v?.toLowerCase().includes(s)) ||
      (digits.length >= 3 && normalizePhone(x.phone).includes(digits)),
  )
}

// Комплекты клиента на хранении — по телефону или машине (для сводки по записи)
export function setsForClient(sets, { phone, car }) {
  const p = normalizePhone(phone)
  const c = car?.trim().toLowerCase()
  return sets.filter((s) => isStored(s) && ((p.length >= 10 && normalizePhone(s.phone).endsWith(p.slice(-10))) || (c && s.car?.trim().toLowerCase() === c)))
}

export const setTitle = (s) => `№ ${formatNum(s.num)} · ${SEASONS[s.season]?.label ?? ''}`

// Строка журнала для действий с хранением
export function storageEntry(by, action, s, warehouses) {
  return { user_name: by || null, action, car: s.car || '', storage_id: s.id, note: `${setTitle(s)} · ${locationOf(s, warehouses).full}` }
}
