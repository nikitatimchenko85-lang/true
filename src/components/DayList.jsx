import { STATUSES, clipToDay, formatPhone, fromMin, humanStamp } from '../lib.js'

export default function DayList({ date, services, allServices, bookings, settings, onOpen, onCreate }) {
  const visible = new Set(services.map((s) => s.id))
  const byId = Object.fromEntries(allServices.map((s) => [s.id, s]))
  const items = bookings
    .filter((b) => visible.has(b.service_id))
    .map((b) => ({ b, v: clipToDay(b, date, settings) }))
    .filter((x) => x.v)
    .sort((x, y) => x.v.start - y.v.start || x.b.service_id.localeCompare(y.b.service_id))

  if (!items.length)
    return (
      <div className="empty">
        На этот день записей нет.
        <br />
        <button className="primary" onClick={() => onCreate()}>
          + Записать клиента
        </button>
      </div>
    )

  return (
    <ul className="list">
      {items.map(({ b, v }) => {
        const s = byId[b.service_id]
        const st = STATUSES[b.status] || STATUSES.planned
        return (
          <li key={b.id} className={`row status-${b.status}`} style={{ '--c': s?.color || '#999' }} onClick={() => onOpen(b)}>
            <div className="r-time">
              <b>{fromMin(v.start)}</b>
              <span>{fromMin(v.end)}</span>
            </div>
            <div className="r-main">
              <div className="r-top">
                <span className="tag">
                  {s?.name || b.service_id}
                  {s?.posts > 1 ? ` · пост ${b.post}` : ''}
                </span>
                <span className="pill" style={{ '--s': st.color }}>
                  {st.label}
                </span>
              </div>
              <div className="r-name">{b.client_name}</div>
              <div className="r-sub">
                {b.phone && (
                  <a href={`tel:${b.phone}`} onClick={(e) => e.stopPropagation()}>
                    {formatPhone(b.phone)}
                  </a>
                )}
                {[b.car, b.plate].filter(Boolean).join(' · ')}
              </div>
              {(v.continuesBefore || v.continuesAfter) && (
                <div className="r-sub muted">
                  {humanStamp(b.starts_at)} — {humanStamp(b.ends_at)}
                </div>
              )}
              {b.comment && <div className="r-sub muted">{b.comment}</div>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
