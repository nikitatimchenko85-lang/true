// Журнал действий: кто, когда и что сделал. Запись в журнал не должна мешать основной работе —
// если журнал не сохранился, запись/настройки всё равно сохраняются.
import { formatPhone, humanStamp, STATUSES } from './lib.js'
import { rub } from './prices.js'

export const ACTIONS = {
  create: 'Новая запись',
  update: 'Изменение записи',
  move: 'Перенос',
  status: 'Смена статуса',
  settings: 'Изменение настроек',
  pin: 'Новый PIN-код',
  import: 'Импорт записей',
  login: 'Вход',
  storage_in: 'Приём на хранение',
  storage_out: 'Выдача с хранения',
  storage_move: 'Перемещение на складе',
  storage_edit: 'Изменение хранения',
}

// Группы для фильтра в журнале
export const ACTION_GROUPS = [
  ['all', 'Все', null],
  ['bookings', 'Записи', ['create', 'update', 'move', 'status', 'import']],
  ['storage', 'Хранение', ['storage_in', 'storage_out', 'storage_move', 'storage_edit']],
  ['settings', 'Настройки', ['settings', 'pin']],
  ['login', 'Входы', ['login']],
]

const FIELDS = {
  service_id: 'Подразделение',
  post: 'Пост',
  starts_at: 'Начало',
  ends_at: 'Окончание',
  car: 'Машина',
  client_name: 'Клиент',
  phone: 'Телефон',
  work: 'Работа',
  tire_class: 'Класс',
  radius: 'Радиус',
  tags: 'Пометки',
  comment: 'Комментарий',
  status: 'Статус',
  executor: 'Исполнитель',
  items: 'Расчёт',
  total: 'Стоимость',
}

const CONFIG_SECTIONS = {
  departments: 'подразделения и посты',
  users: 'пользователи и права',
  pricelists: 'прайс-листы',
  roles: 'права ролей',
  warehouses: 'склады',
  lock_min: 'автоблокировка',
  company: 'название',
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)

// Что поменялось в записи: { поле: [было, стало] }
export function bookingChanges(prev, next) {
  if (!prev) return null
  const out = {}
  for (const k of Object.keys(FIELDS)) {
    if (!(k in next)) continue
    const a = prev[k]
    const b = next[k]
    if (empty(a) && empty(b)) continue
    if (k === 'post' ? Number(a) !== Number(b) : !same(a, b)) out[k] = [a ?? null, b ?? null]
  }
  return out
}

// Перенос — если поменялись только место и время; смена статуса — если только статус
export function bookingAction(prev, changes) {
  if (!prev) return 'create'
  const keys = Object.keys(changes || {})
  if (!keys.length) return null
  if (keys.every((k) => ['post', 'starts_at', 'ends_at'].includes(k))) return 'move'
  if (keys.every((k) => k === 'status')) return 'status'
  return 'update'
}

export const configNote = (prev, next) =>
  Object.entries(CONFIG_SECTIONS)
    .filter(([k]) => !same(prev?.[k], next?.[k]))
    .map(([, label]) => label)
    .join(', ')

// Готовая строка журнала (без id и времени — их ставит хранилище)
export function bookingEntry(by, prev, next) {
  const changes = bookingChanges(prev, next)
  const action = bookingAction(prev, changes)
  if (!action) return null
  return { user_name: by || null, action, booking_id: next.id || prev?.id || null, service_id: next.service_id || prev?.service_id || null, car: next.car || prev?.car || '', changes, note: prev ? null : humanStamp(next.starts_at) }
}

/* ---------- показ ---------- */

function show(k, v, depts) {
  if (empty(v)) return '—'
  switch (k) {
    case 'service_id':
      return depts?.find((d) => d.id === v)?.name || v
    case 'starts_at':
    case 'ends_at':
      return humanStamp(v)
    case 'status':
      return STATUSES[v]?.label || v
    case 'tags':
      return v.join(', ')
    case 'phone':
      return formatPhone(v)
    case 'total':
      return rub(v)
    case 'items':
      return v.map((l) => l.name).filter(Boolean).join(', ') || '—'
    default:
      return String(v)
  }
}

// [{ label, from, to }] для показа изменений; пост — по названию из подразделения
export function describeChanges(e, depts) {
  if (!e.changes) return []
  const dept = (id) => depts?.find((d) => d.id === id)
  const svc = e.changes.service_id
  return Object.entries(e.changes).map(([k, [a, b]]) => {
    if (k === 'post') {
      const name = (id, n) => dept(id)?.posts[Number(n) - 1]?.name || `Пост ${n}`
      return { label: FIELDS.post, from: name(svc?.[0] ?? e.service_id, a), to: name(svc?.[1] ?? e.service_id, b) }
    }
    return { label: FIELDS[k] || k, from: show(k, a, depts), to: show(k, b, depts) }
  })
}
