// Аналитика за период: считается из записей, без отдельных таблиц
import { addDays, isBlocking, workMinutes } from './lib.js'
import { lineSum } from './prices.js'

const paid = (b) => isBlocking(b) // выручка — всё, кроме неявок и отмен
const money = (b) => (paid(b) ? Number(b.total) || 0 : 0)

export function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

// from, to — даты 'YYYY-MM-DD' включительно. Запись относится к дню начала.
export function summarize(bookings, depts, from, to) {
  const byId = Object.fromEntries(depts.map((d) => [d.id, d]))
  const list = bookings.filter((b) => byId[b.service_id] && b.starts_at.slice(0, 10) >= from && b.starts_at.slice(0, 10) <= to)
  const days = daysBetween(from, to)

  const count = list.filter((b) => b.status !== 'cancelled').length
  const noShow = list.filter((b) => b.status === 'no_show')
  const cancelled = list.filter((b) => b.status === 'cancelled').length
  const priced = list.filter((b) => paid(b) && Number(b.total) > 0)
  const revenue = list.reduce((a, b) => a + money(b), 0)

  const busyMin = (d) =>
    list.filter((b) => b.service_id === d.id && isBlocking(b)).reduce((a, b) => a + workMinutes(b.starts_at, b.ends_at, d), 0)
  const capacity = (d) => days.length * d.posts.length * (d.close_min - d.open_min)

  const byDay = days.map((date) => {
    const l = list.filter((b) => b.starts_at.startsWith(date))
    return { date, count: l.filter((b) => b.status !== 'cancelled').length, revenue: l.reduce((a, b) => a + money(b), 0) }
  })

  const byDept = depts.map((d) => {
    const l = list.filter((b) => b.service_id === d.id)
    return {
      id: d.id,
      name: d.name,
      color: d.color,
      count: l.filter((b) => b.status !== 'cancelled').length,
      noShow: l.filter((b) => b.status === 'no_show').length,
      revenue: l.reduce((a, b) => a + money(b), 0),
      load: capacity(d) ? busyMin(d) / capacity(d) : 0,
    }
  })

  const group = (key, map) => {
    const m = new Map()
    for (const b of list) {
      if (b.status === 'cancelled') continue
      for (const [k, v] of map(b)) {
        const x = m.get(k) || { name: k, count: 0, qty: 0, revenue: 0 }
        x.count += v.count ?? 1
        x.qty += v.qty ?? 0
        x.revenue += v.revenue ?? 0
        m.set(k, x)
      }
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count)
  }

  const byAdmin = group('admin', (b) => [[b.created_by || 'Не указан', { revenue: money(b) }]])
  const byService = group('service', (b) =>
    paid(b) ? (b.items || []).map((l) => [l.name, { qty: Number(l.qty) || 0, revenue: lineSum(l) }]) : [],
  )
  const byWork = group('work', (b) => [[b.work || 'Не указан', { revenue: money(b) }]])

  const totalCapacity = depts.reduce((a, d) => a + capacity(d), 0)
  return {
    count,
    cancelled,
    noShow: noShow.length,
    noShowRate: count ? noShow.length / count : 0,
    revenue,
    avg: priced.length ? revenue / priced.length : 0,
    unpriced: list.filter((b) => paid(b) && !(Number(b.total) > 0)).length,
    load: totalCapacity ? depts.reduce((a, d) => a + busyMin(d), 0) / totalCapacity : 0,
    byDay,
    byDept,
    byAdmin,
    byService,
    byWork,
    noShows: noShow.sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1)),
  }
}
