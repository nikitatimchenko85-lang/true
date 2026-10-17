import { STATUSES, clipToDay, formatPhone, fromMin, humanStamp } from '../lib.js'
import { rub } from '../prices.js'

export default function DayList({ date, depts, bookings, view, onOpen, onCreate }) {
  const byId = Object.fromEntries(depts.map((d) => [d.id, d]))
  const items = bookings
    .filter((b) => byId[b.service_id])
    .map((b) => ({ b, v: clipToDay(b, date, view) }))
    .filter((x) => x.v)
    .sort((x, y) => x.v.start - y.v.start || x.b.service_id.localeCompare(y.b.service_id) || x.b.post - y.b.post)

  if (!items.length)
    return (
      <div className="empty">
        На этот день записей нет.
        <br />
        <button className="primary" onClick={() => onCreate()}>
          + Записать
        </button>
      </div>
    )

  return (
    <ul className="list">
      {items.map(({ b, v }) => {
        const d = byId[b.service_id]
        const st = STATUSES[b.status] || STATUSES.planned
        const post = d.posts[b.post - 1]?.name || `Пост ${b.post}`
        return (
          <li key={b.id} className={`row status-${b.status}`} style={{ '--c': d.color }} onClick={() => onOpen(b)}>
            <div className="r-time">
              <b>{fromMin(v.start)}</b>
              <span>{fromMin(v.end)}</span>
            </div>
            <div className="r-main">
              <div className="r-top">
                <span className="tag">
                  {d.name} · {post}
                </span>
                {b.total > 0 && <span className="sum">{rub(b.total)}</span>}
                {b.status !== 'planned' && (
                  <span className="pill" style={{ '--s': st.color }}>
                    {st.label}
                  </span>
                )}
              </div>
              <div className="r-name">{b.car}</div>
              <div className="r-sub">
                {b.client_name && <span>{b.client_name}</span>}
                {b.phone && (
                  <a href={`tel:${b.phone}`} onClick={(e) => e.stopPropagation()}>
                    {formatPhone(b.phone)}
                  </a>
                )}
                {[b.work, b.tire_class, b.radius].filter(Boolean).join(' · ')}
              </div>
              {(b.tags?.length > 0 || b.comment) && (
                <div className="r-sub">
                  {b.tags?.map((t) => (
                    <span key={t} className="mini-tag">
                      {t}
                    </span>
                  ))}
                  {b.comment && <span className="muted">{b.comment}</span>}
                </div>
              )}
              {(v.continuesBefore || v.continuesAfter) && (
                <div className="r-sub muted">
                  {humanStamp(b.starts_at)} — {humanStamp(b.ends_at)}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
