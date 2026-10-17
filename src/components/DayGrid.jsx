import { useEffect, useState } from 'react'
import { STATUSES, clipToDay, fromMin, humanStamp, today } from '../lib.js'

const PX = 1.6 // пикселей на минуту

export default function DayGrid({ date, services, bookings, settings, onCreate, onOpen }) {
  const { open_min, close_min, step } = settings
  const height = (close_min - open_min) * PX
  const nowMin = useNowMin()

  if (!services.length) return <div className="empty">Выберите хотя бы одну услугу сверху.</div>

  const hours = []
  for (let m = Math.ceil(open_min / 60) * 60; m < close_min; m += 60) hours.push(m)
  const lines = []
  for (let m = open_min; m < close_min; m += step) lines.push(m)

  const columns = services.flatMap((s) =>
    Array.from({ length: s.posts }, (_, i) => ({ service: s, post: i + 1 })),
  )

  const clickColumn = (e, col) => {
    if (e.target !== e.currentTarget) return
    const y = e.nativeEvent.offsetY
    const min = open_min + Math.floor(y / PX / step) * step
    onCreate({ service_id: col.service.id, post: col.post, date, min })
  }

  return (
    <div className="grid-wrap">
      <div className="grid" style={{ '--cols': columns.length }}>
        <div className="corner" />
        {services.map((s) => (
          <div key={s.id} className="svc-head" style={{ gridColumn: `span ${s.posts}`, '--c': s.color }}>
            {s.name}
          </div>
        ))}
        <div className="corner sub" />
        {columns.map((c) => (
          <div key={c.service.id + c.post} className="post-head">
            {c.service.posts > 1 ? `Пост ${c.post}` : ' '}
          </div>
        ))}

        <div className="times" style={{ height }}>
          {hours.map((m) => (
            <div key={m} className="time" style={{ top: (m - open_min) * PX }}>
              {fromMin(m)}
            </div>
          ))}
        </div>

        {columns.map((col) => (
          <div
            key={col.service.id + col.post}
            className="col"
            style={{ height, '--c': col.service.color }}
            onClick={(e) => clickColumn(e, col)}
            title="Нажмите на свободное место, чтобы записать"
          >
            {lines.map((m) => (
              <div
                key={m}
                className={`line ${m % 60 === 0 ? 'hour' : ''}`}
                style={{ top: (m - open_min) * PX }}
              />
            ))}
            {date === today() && nowMin > open_min && nowMin < close_min && (
              <div className="now" style={{ top: (nowMin - open_min) * PX }} />
            )}
            {bookings
              .filter((b) => b.service_id === col.service.id && Number(b.post) === col.post)
              .map((b) => {
                const v = clipToDay(b, date, settings)
                if (!v) return null
                const st = STATUSES[b.status] || STATUSES.planned
                const h = (v.end - v.start) * PX
                return (
                  <button
                    key={b.id}
                    className={`booking status-${b.status}`}
                    style={{ top: (v.start - open_min) * PX, height: Math.max(h - 2, 18), '--s': st.color }}
                    onClick={() => onOpen(b)}
                    title={`${b.client_name} · ${humanStamp(b.starts_at)} — ${humanStamp(b.ends_at)}`}
                  >
                    <div className="b-time">
                      {v.continuesBefore ? '↑ ' : ''}
                      {fromMin(v.start)}–{fromMin(v.end)}
                      {v.continuesAfter ? ' ↓' : ''}
                      <span className="b-status">{st.label}</span>
                    </div>
                    <div className="b-name">{b.client_name}</div>
                    {h > 50 && <div className="b-car">{[b.car, b.plate].filter(Boolean).join(' · ')}</div>}
                  </button>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}

function useNowMin() {
  const get = () => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }
  const [m, setM] = useState(get)
  useEffect(() => {
    const t = setInterval(() => setM(get()), 60_000)
    return () => clearInterval(t)
  }, [])
  return m
}
