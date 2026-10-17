// Чистые функции: время, даты, проверка пересечений. Без зависимостей — покрыты тестами.

export const STATUSES = {
  planned: { label: 'Записан', color: '#2563eb' },
  arrived: { label: 'Приехал', color: '#7c3aed' },
  in_progress: { label: 'В работе', color: '#d97706' },
  done: { label: 'Готово', color: '#16a34a' },
  cancelled: { label: 'Отменена', color: '#9ca3af' },
  no_show: { label: 'Не приехал', color: '#dc2626' },
}

// Отменённые и неявки не занимают пост
export const isBlocking = (b) => b.status !== 'cancelled' && b.status !== 'no_show'

export const DEFAULT_SERVICES = [
  { id: 'wrap', name: 'Оклейка плёнкой', color: '#2563eb', duration: 480, posts: 2, sort: 1, active: true },
  { id: 'tires', name: 'Шиномонтаж', color: '#16a34a', duration: 60, posts: 2, sort: 2, active: true },
  { id: 'service', name: 'СТО', color: '#d97706', duration: 120, posts: 2, sort: 3, active: true },
  { id: 'polish', name: 'Полировка / керамика', color: '#7c3aed', duration: 240, posts: 1, sort: 4, active: true },
  { id: 'wash', name: 'Мойка / химчистка', color: '#0891b2', duration: 90, posts: 1, sort: 5, active: true },
]

export const DEFAULT_SETTINGS = { company: 'Детейлинг', open_min: 9 * 60, close_min: 21 * 60, step: 30 }

const pad = (n) => String(n).padStart(2, '0')

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDate = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (key, n) => {
  const d = parseDate(key)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}
export const today = () => dateKey(new Date())

// Метки времени — строки 'YYYY-MM-DDTHH:MM' (местное время), сравниваются как строки
export const stamp = (date, min) => `${date}T${fromMin(min)}`
export const splitStamp = (s) => ({ date: s.slice(0, 10), min: toMin(s.slice(11, 16)) })
export const normStamp = (s) => (s || '').replace(' ', 'T').slice(0, 16)

// Конец работы, если начать в start и работать duration минут.
// Длинные работы (оклейка) переносятся на следующий рабочий день.
export function computeEnd(start, duration, settings) {
  let { date, min } = splitStamp(start)
  let left = duration
  for (let guard = 0; guard < 60; guard++) {
    const dayEnd = Math.max(settings.close_min, min)
    const avail = dayEnd - min
    if (left <= avail) return stamp(date, min + left)
    left -= avail
    date = addDays(date, 1)
    min = settings.open_min
  }
  return stamp(date, min)
}

export const overlaps = (a, b) => a.starts_at < b.ends_at && b.starts_at < a.ends_at

export function findConflict(bookings, cand) {
  if (!isBlocking(cand)) return null
  return (
    bookings.find(
      (b) =>
        b.id !== cand.id &&
        isBlocking(b) &&
        b.service_id === cand.service_id &&
        Number(b.post) === Number(cand.post) &&
        overlaps(b, cand),
    ) || null
  )
}

// Первый свободный пост услуги на это время, или null
export function freePost(bookings, service, cand) {
  for (let p = 1; p <= service.posts; p++) {
    if (!findConflict(bookings, { ...cand, service_id: service.id, post: p })) return p
  }
  return null
}

// Видимая часть записи в рамках дня [open, close]
export function clipToDay(b, date, settings) {
  const dayStart = stamp(date, settings.open_min)
  const dayEnd = stamp(date, settings.close_min)
  if (!(b.starts_at < dayEnd && b.ends_at > dayStart)) return null
  const s = b.starts_at > dayStart ? splitStamp(b.starts_at).min : settings.open_min
  const e = b.ends_at < dayEnd ? splitStamp(b.ends_at).min : settings.close_min
  return { start: s, end: e, continuesBefore: b.starts_at < dayStart, continuesAfter: b.ends_at > dayEnd }
}

export const normalizePhone = (p) => (p || '').replace(/\D/g, '')

export function formatPhone(p) {
  const d = normalizePhone(p)
  if (d.length === 11 && (d[0] === '7' || d[0] === '8'))
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  return p
}

export function formatDuration(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export const weekday = (key) => WEEKDAYS[parseDate(key).getDay()]
export const humanDate = (key) => {
  const d = parseDate(key)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export const humanStamp = (s) => {
  const { date, min } = splitStamp(s)
  return `${humanDate(date)}, ${fromMin(min)}`
}

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

// Сколько рабочих минут между двумя метками (обратная к computeEnd)
export function workMinutes(start, end, settings) {
  const s = splitStamp(start)
  const e = splitStamp(end)
  let date = s.date
  let total = 0
  for (let guard = 0; guard < 60 && date <= e.date; guard++) {
    const from = date === s.date ? s.min : settings.open_min
    const to = date === e.date ? e.min : Math.max(settings.close_min, from)
    total += Math.max(0, to - from)
    date = addDays(date, 1)
  }
  return total
}
