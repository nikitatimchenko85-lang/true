// Чистые функции: время, даты, проверка пересечений. Без зависимостей — покрыты тестами.

// Статусы. "Записан" в таблице — пустая ячейка (клиент приехал / всё в порядке).
export const STATUSES = {
  planned: { label: 'Записан', sheet: '', color: '#2563eb' },
  no_show: { label: 'Не приехал', sheet: 'Не приехал', color: '#dc2626' },
  cancelled: { label: 'Отменил заранее', sheet: 'Отменил заранее', color: '#9ca3af' },
  in_progress: { label: 'В работе', sheet: 'В работе', color: '#d97706', extended: true },
  waiting_parts: { label: 'Ждёт запчасти', sheet: 'Ждёт запчасти', color: '#7c3aed', extended: true },
  done: { label: 'Готово', sheet: 'Готово', color: '#16a34a', extended: true },
}
export const statusesFor = (dept) =>
  Object.entries(STATUSES).filter(([, v]) => !v.extended || dept?.extended_statuses)

// Не приехал и отменённые не занимают пост
export const isBlocking = (b) => b.status !== 'cancelled' && b.status !== 'no_show'

// Быстрые пометки одним касанием — у каждого подразделения свои (Настройки → Подразделения)
export const TAGS = ['договор', 'хранение', 'Run Flat', 'далее мойка', 'машина уже в центре']
export const DEFAULT_TAGS = {
  tires: TAGS,
  wash: ['договор', 'машина уже в центре'],
  service: ['договор', 'далее мойка', 'машина уже в центре'],
  detailing: ['договор', 'далее мойка', 'машина уже в центре'],
  anticor: ['договор', 'далее мойка', 'машина уже в центре'],
}
export const tagsFor = (dept) => dept?.tags ?? DEFAULT_TAGS[dept?.id] ?? ['договор', 'машина уже в центре']

// Виды работ поста: свои, если заданы в настройках, иначе подразделения.
// Портальная мойка — только на портале, на ручных боксах её нет.
const isPortal = (s) => /портал/i.test(s || '')
export function worksFor(dept, post) {
  const all = dept?.works || []
  if (post?.works?.length) return post.works
  if (!all.some(isPortal)) return all
  return isPortal(post?.name) ? all.filter((w) => isPortal(w) || w === 'Прочее') : all.filter((w) => !isPortal(w))
}

export const TIRE_CLASSES = ['II', 'III', 'IV', 'V', 'Низкий профиль', 'Свыше 3,5 тонн']
export const RADII = Array.from({ length: 11 }, (_, i) => `R${13 + i}`)

const H = (h) => h * 60

export const DEFAULT_CONFIG = {
  company: 'TRUE DETAILING',
  admins: ['Данилов', 'Мудрец Я.', 'Клименко', 'Горкунов'],
  departments: [
    {
      id: 'tires', name: 'Шиномонтаж', color: '#1fae78', step: 30, open_min: H(8), close_min: H(23),
      sheet: 'Заявки Шиномонтаж', tire_fields: true, extended_statuses: false, active: true,
      works: [
        'Комплексный шиномонтаж', 'Снятие и установка колес', 'Монтаж и демонтаж', 'Балансировка', 'Ремонт шины',
        'Варка бокового пореза', 'Правка литого диска', 'Хранение: прием или выдача', 'Дошиповка', 'Прочее',
      ],
      posts: [
        { name: 'Пост 1 Автолюкс', entity: 'АвтоЛюкс', duration: 60, banned: '' },
        { name: 'Пост 2 Автолюкс', entity: 'АвтоЛюкс', duration: 60, banned: '' },
        { name: 'Пост 3 Валькор', entity: 'Валькор', duration: 120, banned: 'Mercedes' },
        { name: 'Пост 4 Валькор', entity: 'Валькор', duration: 120, banned: 'Mercedes' },
      ],
    },
    {
      id: 'wash', name: 'Мойка', color: '#1e9be0', step: 30, open_min: H(8), close_min: H(23),
      sheet: 'Заявки Мойка', active: true,
      works: ['Ручная мойка', 'Портальная мойка', 'Комплексная мойка', 'Химчистка', 'Прочее'],
      posts: [
        { name: 'Ручная, бокс 1', entity: 'АвтоЛюкс', duration: 60, banned: '' },
        { name: 'Ручная, бокс 2', entity: 'АвтоЛюкс', duration: 60, banned: '' },
        { name: 'Портал', entity: 'АвтоЛюкс', duration: 30, banned: '' },
      ],
    },
    {
      id: 'service', name: 'СТО', color: '#ee6516', step: 30, open_min: H(9), close_min: H(21),
      sheet: 'Заявки СТО', extended_statuses: true, active: true,
      works: ['Диагностика', 'ТО', 'Подвеска', 'Двигатель', 'Электрика', 'Шиномонтаж', 'Прочее'],
      posts: [
        { name: 'Пост 1', entity: 'Валькор', duration: 120, banned: '' },
        { name: 'Пост 2', entity: 'Валькор', duration: 120, banned: '' },
      ],
    },
    {
      id: 'detailing', name: 'Детейлинг', color: '#8a6cf5', step: 60, open_min: H(9), close_min: H(21),
      sheet: 'Заявки Детейлинг', extended_statuses: true, active: true,
      works: ['Оклейка плёнкой', 'Полировка', 'Керамика', 'Химчистка салона', 'Тонировка', 'Прочее'],
      posts: [
        { name: 'Бокс Автолюкс', entity: 'АвтоЛюкс', duration: 480, banned: '' },
        { name: 'Бокс Валькор', entity: 'Валькор', duration: 480, banned: '' },
      ],
    },
    {
      id: 'anticor', name: 'Антикор', color: '#a8a29e', step: 60, open_min: H(9), close_min: H(21),
      sheet: 'Заявки Антикор TRUE', extended_statuses: true, active: false,
      works: ['Антикор днища', 'Скрытые полости', 'Прочее'],
      posts: [{ name: 'Бокс антикор', entity: 'Валькор', duration: 480, banned: '' }],
    },
  ],
}

// Ограничения поста: "Mercedes не записываем" и т.п. Возвращает запрещённую марку или null.
const BRAND_ALIASES = {
  mercedes: ['mercedes', 'мерседес', 'мерс', 'benz', 'бенц', 'amg', 'амг', 'mb '],
}
export function bannedBrand(post, car) {
  if (!post?.banned || !car) return null
  const text = ` ${car.toLowerCase()} `
  for (const raw of post.banned.split(',')) {
    const brand = raw.trim()
    if (!brand) continue
    const aliases = BRAND_ALIASES[brand.toLowerCase()] || [brand.toLowerCase()]
    if (aliases.some((a) => text.includes(a))) return brand
  }
  return null
}

// Сетка для режима "все подразделения": самые широкие часы и самый мелкий шаг
export function unionView(depts) {
  if (!depts.length) return { open_min: H(9), close_min: H(21), step: 30 }
  return {
    open_min: Math.min(...depts.map((d) => d.open_min)),
    close_min: Math.max(...depts.map((d) => d.close_min)),
    step: Math.min(...depts.map((d) => d.step)),
  }
}

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
  for (let p = 1; p <= service.posts.length; p++) {
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
  let d = normalizePhone(p)
  if (d.length === 10 && d[0] === '9') d = '7' + d
  if (d.length === 11 && (d[0] === '7' || d[0] === '8'))
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  return p
}

// Проверка телефона: пусто — можно, иначе российский номер из 11 цифр (или 10, начиная с 9)
export function phoneError(p) {
  if (!p?.trim()) return ''
  if (/[^\d\s()+\-]/.test(p)) return 'В телефоне только цифры'
  const d = normalizePhone(p)
  if (d.length === 10 && d[0] === '9') return ''
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return ''
  if (d.length === 11) return 'Номер должен начинаться с +7 или 8'
  return d.length < 11 ? `Не хватает цифр: ${d.length} из 11` : `Лишние цифры: ${d.length} из 11`
}

// Начало текущего слота: раньше него записывать нельзя
export function nowSlot(step) {
  const d = new Date()
  const m = d.getHours() * 60 + d.getMinutes()
  return stamp(dateKey(d), Math.floor(m / step) * step)
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

// Ближайшие свободные окна подразделения начиная с from: на каждое время — первый свободный пост.
// duration — длительность (иначе стандартная для поста), car — чтобы не предлагать посты с запретом марки.
export function nextFreeSlots(bookings, dept, from, { duration, count = 6, days = 7, id, car } = {}) {
  const out = []
  let { date, min } = splitStamp(from)
  min = Math.max(dept.open_min, Math.ceil(min / dept.step) * dept.step)
  for (let d = 0; d < days && out.length < count; d++) {
    for (let m = min; m < dept.close_min && out.length < count; m += dept.step) {
      const starts_at = stamp(date, m)
      for (let p = 1; p <= dept.posts.length; p++) {
        const post = dept.posts[p - 1]
        if (bannedBrand(post, car)) continue
        const ends_at = computeEnd(starts_at, duration || post.duration, dept)
        if (!findConflict(bookings, { id, service_id: dept.id, post: p, starts_at, ends_at, status: 'planned' })) {
          out.push({ post: p, starts_at, ends_at })
          break
        }
      }
    }
    date = addDays(date, 1)
    min = dept.open_min
  }
  return out
}

export function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
