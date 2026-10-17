// Импорт записей из Google Таблицы «Заявки Шиномонтаж» (Файл → Скачать → CSV).
// Колонки как в брифе: A дата заявки, B машина, C клиент/телефон, D класс, E радиус, F вид работы,
// G комментарий, H дата записи, I время, J пост, K администратор, L длительность, M статус.
import { computeEnd, stamp, toMin } from './lib.js'

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const pad = (n) => String(n).padStart(2, '0')

function parseDate(s) {
  s = (s || '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`
  return null
}

function parseTime(s) {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})/)
  return m ? toMin(`${m[1]}:${m[2]}`) : null
}

const STATUS = { '': 'planned', 'не приехал': 'no_show', 'отменил заранее': 'cancelled', 'отменил': 'cancelled' }

function splitClient(s) {
  const text = (s || '').trim()
  const m = text.match(/(\+?[78]?[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2})/)
  if (!m) return { client_name: text, phone: '' }
  return {
    phone: m[1].trim(),
    client_name: text.replace(m[1], '').replace(/^[\s,;]+|[\s,;]+$/g, ''),
  }
}

function findPost(dept, name) {
  const n = (name || '').trim().toLowerCase()
  if (!n) return 0
  const exact = dept.posts.findIndex((p) => p.name.toLowerCase() === n)
  if (exact >= 0) return exact + 1
  const num = n.match(/(\d+)/)?.[1]
  const byNum = dept.posts.findIndex((p) => p.name.toLowerCase().match(/(\d+)/)?.[1] === num)
  return byNum >= 0 ? byNum + 1 : 0
}

// Возвращает { bookings, errors } — errors: строки, которые не удалось разобрать
export function rowsToBookings(rows, dept) {
  const header = rows.findIndex((r) => r.some((c) => /автомобил/i.test(c)))
  const data = rows.slice(header + 1)
  const bookings = []
  const errors = []
  data.forEach((r, i) => {
    const line = header + i + 2
    const [, car, client, cls, radius, work, comment, d, t, postName, admin, dur, status] = r
    if (!r.some((c) => c && c.trim())) return
    const date = parseDate(d)
    const min = parseTime(t)
    const post = findPost(dept, postName)
    if (!car?.trim() || !date || min == null || !post) {
      errors.push({ line, reason: !car?.trim() ? 'нет машины' : !date ? 'нет даты' : min == null ? 'нет времени' : 'неизвестный пост' })
      return
    }
    const st = STATUS[(status || '').trim().toLowerCase()]
    const duration = Number(dur) || dept.posts[post - 1].duration
    const starts_at = stamp(date, min)
    bookings.push({
      service_id: dept.id,
      post,
      starts_at,
      ends_at: computeEnd(starts_at, duration, dept),
      car: car.trim(),
      ...splitClient(client),
      tire_class: (cls || '').trim(),
      radius: (radius || '').trim(),
      work: (work || '').trim(),
      tags: [],
      comment: (comment || '').trim(),
      status: st || 'planned',
      created_by: (admin || '').trim() || null,
    })
  })
  return { bookings, errors }
}
