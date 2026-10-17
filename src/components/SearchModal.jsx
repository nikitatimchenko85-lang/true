import { useEffect, useState } from 'react'
import { store } from '../store.js'
import { STATUSES, formatPhone, humanStamp } from '../lib.js'
import Modal from './Modal.jsx'

export default function SearchModal({ depts, onClose, onPick }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const byId = Object.fromEntries(depts.map((d) => [d.id, d]))

  useEffect(() => {
    if (q.trim().length < 2) return setRes(null)
    const t = setTimeout(() => store.searchBookings(q.trim()).then(setRes).catch(() => setRes([])), 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <Modal title="Поиск записи" onClose={onClose}>
      <input
        className="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Машина, номер, клиент или телефон"
      />
      {res && !res.length && <p className="muted">Ничего не найдено</p>}
      {res && (
        <ul className="results">
          {res.map((b) => (
            <li key={b.id} onClick={() => onPick(b)} style={{ '--c': byId[b.service_id]?.color || '#999' }}>
              <div>
                <b>{b.car}</b> {b.client_name} {b.phone && <span className="muted">{formatPhone(b.phone)}</span>}
              </div>
              <div className="small">
                {humanStamp(b.starts_at)} · {byId[b.service_id]?.name || b.service_id} · {STATUSES[b.status]?.label}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
