import { useEffect, useMemo, useState } from 'react'
import { store } from '../store.js'
import { addDays, formatPhone, humanDate, humanStamp, parseDate, plural, stamp, today, weekday } from '../lib.js'
import { rub } from '../prices.js'
import { summarize } from '../analytics.js'
import { bookingsCsv, download, sheetCsv, toCsv } from '../exports.js'
import BarChart from './BarChart.jsx'
import Modal from './Modal.jsx'

const monthStart = (key) => `${key.slice(0, 8)}01`
const PERIODS = [
  ['Сегодня', () => [today(), today()]],
  ['7 дней', () => [addDays(today(), -6), today()]],
  ['Этот месяц', () => [monthStart(today()), today()]],
  ['Прошлый месяц', () => {
    const end = addDays(monthStart(today()), -1)
    return [monthStart(end), end]
  }],
  ['Следующие 7 дней', () => [today(), addDays(today(), 6)]],
]
const pct = (x) => `${Math.round(x * 100)}%`
const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.0', '')} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс` : String(Math.round(n)))

export default function ReportsModal({ depts, canExport, onClose, onOpen }) {
  const [[from, to], setRange] = useState(PERIODS[2][1])
  const [deptId, setDeptId] = useState('all')
  const [metric, setMetric] = useState('count')
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!from || !to || from > to) return
    setBookings(null)
    store
      .listBookings(stamp(from, 0), stamp(addDays(to, 1), 0))
      .then(setBookings)
      .catch((e) => setError('Не удалось загрузить: ' + e.message))
  }, [from, to])

  const shown = useMemo(() => (deptId === 'all' ? depts : depts.filter((d) => d.id === deptId)), [depts, deptId])
  const s = useMemo(() => (bookings ? summarize(bookings, shown, from, to) : null), [bookings, shown, from, to])
  const inRange = (bookings || []).filter((b) => shown.some((d) => d.id === b.service_id) && b.starts_at.slice(0, 10) >= from && b.starts_at.slice(0, 10) <= to)
  const period = from === to ? humanDate(from) : `${humanDate(from)} — ${humanDate(to)}`
  // латиница в имени файла: с кириллицей некоторые браузеры сохраняют файл как «download» без расширения
  const fname = (what) => `true-${what}-${from}${from === to ? '' : '_' + to}.csv`

  const summaryCsv = () =>
    toCsv([
      ['Сводка', period],
      ['Записей', s.count], ['Выручка, ₽', s.revenue], ['Средний чек, ₽', Math.round(s.avg)], ['Неявки', s.noShow],
      ['Отмены', s.cancelled], ['Загрузка постов', pct(s.load)],
      [],
      ['Подразделение', 'Записей', 'Неявки', 'Выручка, ₽', 'Загрузка'],
      ...s.byDept.map((d) => [d.name, d.count, d.noShow, d.revenue, pct(d.load)]),
      [],
      ['Администратор', 'Записей', 'Выручка, ₽'],
      ...s.byAdmin.map((a) => [a.name, a.count, a.revenue]),
      [],
      ['Услуга', 'Кол-во', 'Выручка, ₽'],
      ...s.byService.map((x) => [x.name, x.qty, x.revenue]),
    ])

  return (
    <Modal title="Отчёты" onClose={onClose} wide>
      <div className="form reports">
        <div className="presets">
          {PERIODS.map(([name, fn]) => {
            const [a, b] = fn()
            return (
              <button type="button" key={name} className={a === from && b === to ? 'on' : ''} onClick={() => setRange([a, b])}>
                {name}
              </button>
            )
          })}
        </div>
        <div className="row2">
          <label>
            С
            <input type="date" value={from} onChange={(e) => e.target.value && setRange([e.target.value, to < e.target.value ? e.target.value : to])} />
          </label>
          <label>
            По
            <input type="date" value={to} onChange={(e) => e.target.value && setRange([from > e.target.value ? e.target.value : from, e.target.value])} />
          </label>
        </div>
        {depts.length > 1 && (
          <div className="presets depts">
            <button type="button" className={deptId === 'all' ? 'on' : ''} onClick={() => setDeptId('all')}>
              Все
            </button>
            {depts.map((d) => (
              <button type="button" key={d.id} className={deptId === d.id ? 'on' : ''} style={{ '--c': d.color }} onClick={() => setDeptId(d.id)}>
                <i /> {d.name}
              </button>
            ))}
          </div>
        )}

        {error && <div className="err">{error}</div>}
        {!s ? (
          !error && <p className="muted">Считаем…</p>
        ) : (
          <>
            <div className="kpis">
              <div className="kpi dark">
                <small>Выручка</small>
                <b>{rub(s.revenue)}</b>
              </div>
              <div className="kpi">
                <small>Записей</small>
                <b>{s.count}</b>
              </div>
              <div className="kpi">
                <small>Средний чек</small>
                <b>{rub(s.avg)}</b>
              </div>
              <div className="kpi">
                <small>Не приехали</small>
                <b>
                  {s.noShow} <span className="muted">· {pct(s.noShowRate)}</span>
                </b>
              </div>
              <div className="kpi">
                <small>Загрузка постов</small>
                <b>{pct(s.load)}</b>
              </div>
            </div>
            {s.unpriced > 0 && (
              <p className="muted small">
                Без расчёта стоимости: {s.unpriced} {plural(s.unpriced, 'запись', 'записи', 'записей')} — в выручку не попали.
              </p>
            )}

            {s.byDay.length > 1 && (
              <section>
                <div className="section-head">
                  <h3>{metric === 'count' ? 'Записи по дням' : 'Выручка по дням'}</h3>
                  <div className="presets">
                    <button type="button" className={metric === 'count' ? 'on' : ''} onClick={() => setMetric('count')}>
                      Записи
                    </button>
                    <button type="button" className={metric === 'revenue' ? 'on' : ''} onClick={() => setMetric('revenue')}>
                      Выручка
                    </button>
                  </div>
                </div>
                <BarChart
                  title={metric === 'count' ? 'Записи по дням' : 'Выручка по дням'}
                  data={s.byDay}
                  value={(d) => d[metric]}
                  format={(v, axis) => (metric === 'count' ? String(Math.round(v)) : axis ? short(v) : rub(v))}
                  label={(d, axis) => (axis ? String(parseDate(d.date).getDate()) : `${weekday(d.date)}, ${humanDate(d.date)}`)}
                />
              </section>
            )}

            {shown.length > 1 && (
              <Table
                title="По подразделениям"
                head={['', 'Записей', 'Неявки', 'Выручка', 'Загрузка']}
                rows={s.byDept.map((d) => [
                  <span className="dot-name" style={{ '--c': d.color }} key="n">
                    <i />
                    {d.name}
                  </span>,
                  d.count, d.noShow, rub(d.revenue), pct(d.load),
                ])}
              />
            )}
            <Table title="По администраторам" head={['', 'Записей', 'Выручка']} rows={s.byAdmin.map((a) => [a.name, a.count, rub(a.revenue)])} />
            {s.byService.length > 0 ? (
              <Table title="Услуги" head={['', 'Кол-во', 'Выручка']} rows={s.byService.slice(0, 15).map((x) => [x.name, x.qty, rub(x.revenue)])} />
            ) : (
              <Table title="Виды работ" head={['', 'Записей']} rows={s.byWork.slice(0, 15).map((x) => [x.name, x.count])} />
            )}
            {s.noShows.length > 0 && (
              <section>
                <h3>Не приехали</h3>
                <ul className="results">
                  {s.noShows.slice(0, 30).map((b) => (
                    <li key={b.id} onClick={() => onOpen(b)} style={{ '--c': depts.find((d) => d.id === b.service_id)?.color }}>
                      <b>{b.car}</b> {b.client_name} {b.phone && <span className="muted">{formatPhone(b.phone)}</span>}
                      <div className="small">{humanStamp(b.starts_at)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {canExport && (
              <section className="exports">
                <h3>Выгрузить в Excel</h3>
                <p className="muted small">
                  {period}, {inRange.length} {plural(inRange.length, 'запись', 'записи', 'записей')}. Файлы CSV открываются в Excel и Google Таблицах.
                </p>
                <div className="presets">
                  <button type="button" onClick={() => download(fname('bookings'), bookingsCsv(inRange, depts))}>
                    Все записи
                  </button>
                  <button type="button" onClick={() => download(fname('summary'), summaryCsv())}>
                    Сводка
                  </button>
                  {shown.map((d) => (
                    <button type="button" key={d.id} onClick={() => download(fname(`sheet-${d.id}`), sheetCsv(inRange, d))}>
                      Как в таблице «{d.sheet || d.name}»
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function Table({ title, head, rows }) {
  if (!rows.length) return null
  return (
    <section>
      <h3>{title}</h3>
      <div className="rtable-wrap">
        <table className="rtable">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
