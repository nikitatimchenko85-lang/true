import { useEffect, useMemo, useState } from 'react'
import { store } from '../store.js'
import { addDays, humanDate, today } from '../lib.js'
import { ACTIONS, ACTION_GROUPS, describeChanges } from '../journal.js'
import Modal from './Modal.jsx'

const PERIODS = [
  ['Сегодня', 0],
  ['7 дней', 6],
  ['30 дней', 29],
]
const localDay = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const clock = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayStartIso = (key) => new Date(`${key}T00:00`).toISOString()

export function LogEntry({ e, depts, withCar = true, withDate = false }) {
  const dept = depts.find((d) => d.id === e.service_id)
  const changes = describeChanges(e, depts)
  return (
    <li className="log-entry">
      <time>
        {withDate && <small>{new Date(e.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</small>}
        {clock(e.at)}
      </time>
      <div>
        <div className="log-line">
          <b>{e.user_name || '—'}</b> · {ACTIONS[e.action] || e.action}
          {withCar && e.car && (
            <span className="log-car" style={{ '--c': dept?.color }}>
              <i /> {e.car}
            </span>
          )}
          {e.note && <span className="muted"> · {e.note}</span>}
        </div>
        {changes.length > 0 && (
          <ul className="log-changes">
            {changes.map((c) => (
              <li key={c.label}>
                <span className="muted">{c.label}:</span> <s>{c.from}</s> → {c.to}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export default function JournalModal({ depts, onClose }) {
  const [days, setDays] = useState(0)
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setList(null)
    store
      .listLog({ from: dayStartIso(addDays(today(), -days)), limit: 2000 })
      .then(setList)
      .catch((e) => setError('Журнал не загрузился: ' + e.message))
  }, [days])

  const shown = useMemo(() => {
    const actions = ACTION_GROUPS.find(([k]) => k === group)?.[2]
    const s = q.trim().toLowerCase()
    return (list || []).filter(
      (e) => (!actions || actions.includes(e.action)) && (!s || [e.car, e.user_name, e.note].some((x) => x?.toLowerCase().includes(s))),
    )
  }, [list, group, q])

  const byDay = []
  for (const e of shown) {
    const k = localDay(e.at)
    if (byDay.at(-1)?.[0] !== k) byDay.push([k, []])
    byDay.at(-1)[1].push(e)
  }

  return (
    <Modal title="Журнал" onClose={onClose} wide>
      <div className="form journal">
        <div className="presets">
          {PERIODS.map(([name, n]) => (
            <button type="button" key={name} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>
              {name}
            </button>
          ))}
        </div>
        <div className="presets">
          {ACTION_GROUPS.map(([k, name]) => (
            <button type="button" key={k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)}>
              {name}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Машина или сотрудник" value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <div className="err">{error}</div>}
        {!list ? (
          !error && <p className="muted">Загружаем…</p>
        ) : !shown.length ? (
          <p className="muted">За этот период действий нет.</p>
        ) : (
          byDay.map(([day, items]) => (
            <section key={day}>
              <h3 className="log-day">{day === today() ? 'Сегодня' : humanDate(day)}</h3>
              <ul className="log">
                {items.map((e) => (
                  <LogEntry key={e.id} e={e} depts={depts} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Modal>
  )
}
