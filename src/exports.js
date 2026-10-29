// Выгрузки в CSV для Excel (BOM, «;», CRLF) и загрузка прайс-листа обратно
import { RADII, STATUSES, splitStamp, fromMin, workMinutes } from './lib.js'
import { PRICE_CLASSES, lineSum } from './prices.js'

const cell = (v) => {
  const s = v == null ? '' : String(v)
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'

const ruDate = (key) => (key ? `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}` : '')
const time = (s) => {
  const { min } = splitStamp(s)
  return `${Math.floor(min / 60)}:${fromMin(min).slice(3)}`
}
const num = (n) => (n == null || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','))
const itemsText = (items) =>
  (items || []).map((l) => `${l.name}${Number(l.qty) !== 1 ? ` × ${l.qty}` : ''}${l.price != null ? ` = ${lineSum(l)}` : ''}`).join('; ')

// Все записи периода — одна строка на запись
export function bookingsCsv(bookings, depts) {
  const byId = Object.fromEntries(depts.map((d) => [d.id, d]))
  const rows = [[
    'Дата', 'Начало', 'Окончание', 'Подразделение', 'Пост', 'Машина', 'Клиент', 'Телефон', 'Вид работы', 'Класс',
    'Радиус', 'Услуги', 'Сумма, ₽', 'Пометки', 'Комментарий', 'Статус', 'Администратор', 'Исполнитель', 'Создана',
  ]]
  for (const b of [...bookings].sort((x, y) => (x.starts_at < y.starts_at ? -1 : 1))) {
    const d = byId[b.service_id]
    rows.push([
      ruDate(b.starts_at.slice(0, 10)), time(b.starts_at), `${ruDate(b.ends_at.slice(0, 10))} ${time(b.ends_at)}`,
      d?.name || b.service_id, d?.posts[b.post - 1]?.name || `Пост ${b.post}`, b.car, b.client_name, b.phone, b.work,
      b.tire_class, b.radius, itemsText(b.items), num(b.total), (b.tags || []).join(', '), b.comment,
      STATUSES[b.status]?.label || b.status, b.created_by, b.executor, b.created_at ? ruDate(b.created_at.slice(0, 10)) : '',
    ])
  }
  return toCsv(rows)
}

// В колонках листа «Заявки …» из брифа (A–M) — можно вставить в старую Google Таблицу
export const SHEET_HEADER = [
  'Дата заявки', 'Автомобиль, гос номер', 'Клиент, телефон', 'Класс', 'Радиус', 'Вид работы', 'Комментарий',
  'Дата записи', 'Время записи', 'Пост', 'Администратор', 'Длительность, мин', 'Статус',
]
export function sheetCsv(bookings, dept) {
  const rows = [SHEET_HEADER]
  const list = bookings.filter((b) => b.service_id === dept.id).sort((x, y) => (x.starts_at < y.starts_at ? -1 : 1))
  for (const b of list) {
    const comment = [...(b.tags || []), b.comment].filter(Boolean).join(', ')
    rows.push([
      b.created_at ? ruDate(b.created_at.slice(0, 10)) : '', b.car, [b.client_name, b.phone].filter(Boolean).join(', '),
      b.tire_class, b.radius, b.work, comment, ruDate(b.starts_at.slice(0, 10)), time(b.starts_at),
      dept.posts[b.post - 1]?.name || `Пост ${b.post}`, b.created_by, workMinutes(b.starts_at, b.ends_at, dept),
      STATUSES[b.status]?.sheet ?? '',
    ])
  }
  return toCsv(rows)
}

// Прайс-лист: строка на позицию; цена по классу и радиусу — строка на класс
const PRICE_HEADER = ['Код', 'Услуга', 'Ед.', 'Кол-во', 'Класс', 'Цена', 'Цена «от»', ...RADII]
export function pricelistCsv(list) {
  const rows = [PRICE_HEADER]
  const base = (i, cls = '', price = '') => [i.id, i.name, i.unit, i.qty, cls, price, i.from ? 'да' : '']
  for (const i of list) {
    if (i.kind === 'class_radius') {
      for (const cls of Object.keys(i.matrix || {})) rows.push([...base(i, cls), ...RADII.map((r) => i.matrix[cls][r] ?? '')])
    } else if (i.kind === 'radius') rows.push([...base(i), ...RADII.map((r) => i.prices?.[r] ?? '')])
    else rows.push([...base(i, '', i.price ?? '')])
  }
  return toCsv(rows)
}

const toNum = (s) => {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'))
  return s != null && String(s).trim() !== '' && Number.isFinite(n) ? n : null
}

// Обратно из CSV (после правки в Excel). Возвращает { list, errors }
export function parsePricelist(rows) {
  const head = rows.findIndex((r) => r.some((c) => /услуга/i.test(c)))
  if (head < 0) return { list: [], errors: ['Нет строки заголовка со столбцом «Услуга»'] }
  const h = rows[head].map((c) => c.trim())
  const col = (name) => h.findIndex((c) => c.toLowerCase() === name.toLowerCase())
  const ci = { id: col('Код'), name: col('Услуга'), unit: col('Ед.'), qty: col('Кол-во'), cls: col('Класс'), price: col('Цена'), from: col('Цена «от»') }
  const rcols = RADII.map((r) => [r, h.indexOf(r)]).filter(([, i]) => i >= 0)
  const byKey = new Map()
  const errors = []
  rows.slice(head + 1).forEach((r, n) => {
    const name = (r[ci.name] || '').trim()
    if (!name) return
    const id = (ci.id >= 0 && r[ci.id]?.trim()) || name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').slice(0, 40)
    let item = byKey.get(id)
    if (!item) {
      item = {
        id, name, unit: (r[ci.unit] || '').trim() || 'шт', qty: toNum(r[ci.qty]) || 1,
        from: ci.from >= 0 && /^(да|1|yes|от)$/i.test((r[ci.from] || '').trim()), kind: 'fixed',
      }
      byKey.set(id, item)
    }
    const radius = Object.fromEntries(rcols.map(([rad, i]) => [rad, toNum(r[i])]).filter(([, v]) => v != null))
    const cls = ci.cls >= 0 ? (r[ci.cls] || '').trim() : ''
    if (cls) {
      if (!PRICE_CLASSES.includes(cls)) errors.push(`стр. ${head + n + 2}: неизвестный класс «${cls}»`)
      item.kind = 'class_radius'
      item.matrix = { ...(item.matrix || {}), [cls]: radius }
    } else if (Object.keys(radius).length) {
      item.kind = 'radius'
      item.prices = radius
    } else {
      item.price = toNum(r[ci.price])
      if (item.price == null) errors.push(`стр. ${head + n + 2}: «${name}» без цены`)
    }
  })
  return { list: [...byKey.values()], errors }
}

// Файл резервной копии: все записи, настройки, журнал и хранение шин
export const BACKUP_APP = 'true-detailing'
export const backupJson = (data, version) => JSON.stringify({ app: BACKUP_APP, version, exported_at: new Date().toISOString(), ...data })

export function parseBackup(text) {
  let d
  try {
    d = JSON.parse(text)
  } catch {
    throw new Error('Это не файл резервной копии')
  }
  if (d?.app !== BACKUP_APP || !Array.isArray(d.bookings)) throw new Error('Это не резервная копия TRUE Запись')
  return { bookings: d.bookings, config: d.config ?? null, log: Array.isArray(d.log) ? d.log : [], storage: Array.isArray(d.storage) ? d.storage : [], exported_at: d.exported_at, version: d.version }
}

export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
