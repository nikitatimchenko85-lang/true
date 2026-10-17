import { useEffect, useRef, useState } from 'react'
import { STATUSES, clipToDay, fromMin, humanStamp, today } from '../lib.js'

const PX = 1.6 // пикселей на минуту
const LONG_PRESS = 350

// Сетка дня: колонки — посты выбранных подразделений.
// Запись можно перетащить на другое время или пост того же подразделения
// (мышью сразу, на телефоне — удержать палец).
export default function DayGrid({ date, depts, bookings, view, onCreate, onOpen, onMove, canMove }) {
  const { open_min, close_min, step } = view
  const height = (close_min - open_min) * PX
  const nowMin = useNowMin()
  const [drag, setDrag] = useState(null) // { b, col, min, ok }
  const dragRef = useRef(null)
  const suppressClick = useRef(false)

  const columns = depts.flatMap((d) => d.posts.map((p, i) => ({ dept: d, post: i + 1, info: p })))

  useEffect(() => () => dragRef.current?.cleanup?.(), [])

  if (!depts.length) return <div className="empty">Выберите подразделение.</div>

  const hours = []
  for (let m = Math.ceil(open_min / 60) * 60; m < close_min; m += 60) hours.push(m)
  const lines = []
  for (let m = open_min; m < close_min; m += step) lines.push(m)

  const clickColumn = (e, col) => {
    if (e.target !== e.currentTarget || suppressClick.current) return
    const min = open_min + Math.floor(e.nativeEvent.offsetY / PX / step) * step
    onCreate({ service_id: col.dept.id, post: col.post, date, min })
  }

  // ---------- перетаскивание ----------
  const targetAt = (x, y, b, grabOffset) => {
    const el = document.elementFromPoint(x, y)?.closest('.col')
    if (!el) return null
    const col = columns[Number(el.dataset.col)]
    if (!col || col.dept.id !== b.service_id) return null
    const rect = el.getBoundingClientRect()
    const raw = open_min + (y - rect.top - grabOffset) / PX
    const min = Math.max(open_min, Math.min(close_min - step, Math.round(raw / step) * step))
    return { col, min }
  }

  const startDrag = (e, b, v) => {
    if (!canMove(b) || e.button > 0) return
    const startX = e.clientX
    const startY = e.clientY
    const grabOffset = e.clientY - e.currentTarget.getBoundingClientRect().top
    const isTouch = e.pointerType === 'touch'
    let active = false
    let timer = null
    let last = null

    const blockScroll = (ev) => active && ev.preventDefault()
    const activate = () => {
      active = true
      navigator.vibrate?.(15)
      document.addEventListener('touchmove', blockScroll, { passive: false })
      document.body.classList.add('dragging')
      update(startX, startY)
    }
    const update = (x, y) => {
      const t = targetAt(x, y, b, grabOffset)
      if (!t) return
      last = t
      setDrag({ b, colKey: t.col.dept.id + t.col.post, post: t.col.post, min: t.min, dur: v.end - v.start })
    }
    const move = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!active) {
        if (isTouch) {
          if (Math.hypot(dx, dy) > 8) cleanup() // это прокрутка, не перетаскивание
        } else if (Math.hypot(dx, dy) > 5) activate()
        return
      }
      update(ev.clientX, ev.clientY)
    }
    const up = () => {
      const wasActive = active
      cleanup()
      if (!wasActive || !last) return
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 50)
      const sameSpot = last.col.post === Number(b.post) && last.min === v.start && !v.continuesBefore
      if (!sameSpot) onMove(b, { post: last.col.post, date, min: last.min })
    }
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cleanup)
      document.removeEventListener('touchmove', blockScroll)
      document.body.classList.remove('dragging')
      active = false
      setDrag(null)
      dragRef.current = null
    }
    dragRef.current = { cleanup }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cleanup)
    if (isTouch) timer = setTimeout(activate, LONG_PRESS)
  }

  return (
    <div className="grid-wrap">
      <div className="grid" style={{ '--cols': columns.length }}>
        <div className="corner" />
        {depts.map((d) => (
          <div key={d.id} className="svc-head" style={{ gridColumn: `span ${d.posts.length}`, '--c': d.color }}>
            {d.name}
          </div>
        ))}
        <div className="corner sub" />
        {columns.map((c) => (
          <div key={c.dept.id + c.post} className="post-head" title={c.info.entity ? `Юрлицо: ${c.info.entity}` : ''}>
            {c.info.name}
            {c.info.banned && <span className="ban"> · без {c.info.banned}</span>}
          </div>
        ))}

        <div className="times" style={{ height }}>
          {hours.map((m) => (
            <div key={m} className="time" style={{ top: (m - open_min) * PX }}>
              {fromMin(m)}
            </div>
          ))}
        </div>

        {columns.map((col, ci) => {
          const key = col.dept.id + col.post
          const outside = [
            col.dept.open_min > open_min && { top: 0, h: col.dept.open_min - open_min },
            col.dept.close_min < close_min && { top: col.dept.close_min - open_min, h: close_min - col.dept.close_min },
          ].filter(Boolean)
          return (
            <div
              key={key}
              data-col={ci}
              className="col"
              style={{ height, '--c': col.dept.color }}
              onClick={(e) => clickColumn(e, col)}
              title="Нажмите на свободное место, чтобы записать"
            >
              {lines.map((m) => (
                <div key={m} className={`line ${m % 60 === 0 ? 'hour' : ''}`} style={{ top: (m - open_min) * PX }} />
              ))}
              {outside.map((o) => (
                <div key={o.top} className="closed" style={{ top: o.top * PX, height: o.h * PX }} />
              ))}
              {date === today() && nowMin > open_min && nowMin < close_min && (
                <div className="now" style={{ top: (nowMin - open_min) * PX }} />
              )}
              {bookings
                .filter((b) => b.service_id === col.dept.id && Number(b.post) === col.post)
                .map((b) => {
                  const v = clipToDay(b, date, view)
                  if (!v) return null
                  const st = STATUSES[b.status] || STATUSES.planned
                  const h = (v.end - v.start) * PX
                  const details = [b.work, b.tire_class, b.radius].filter(Boolean).join(' · ')
                  const note = [b.client_name, ...(b.tags || []), b.comment].filter(Boolean).join(' · ')
                  return (
                    <button
                      key={b.id}
                      className={`booking status-${b.status} ${drag?.b.id === b.id ? 'lifted' : ''}`}
                      style={{ top: (v.start - open_min) * PX, height: Math.max(h - 2, 18), '--s': st.color }}
                      onPointerDown={(e) => startDrag(e, b, v)}
                      onClick={() => !suppressClick.current && onOpen(b)}
                      onContextMenu={(e) => e.preventDefault()}
                      title={`${b.car} · ${humanStamp(b.starts_at)} — ${humanStamp(b.ends_at)}`}
                    >
                      <div className="b-time">
                        <span>
                          {v.continuesBefore ? '↑ ' : ''}
                          {fromMin(v.start)}–{fromMin(v.end)}
                          {v.continuesAfter ? ' ↓' : ''}
                        </span>
                        {b.status !== 'planned' && <span className="b-status">{st.label}</span>}
                      </div>
                      <div className="b-name">{b.car}</div>
                      {h > 44 && note && <div className="b-car">{note}</div>}
                      {h > 64 && details && <div className="b-car">{details}</div>}
                    </button>
                  )
                })}
              {drag && drag.colKey === key && (
                <div
                  className="ghost"
                  style={{ top: (drag.min - open_min) * PX, height: Math.max(drag.dur * PX - 2, 18) }}
                >
                  {fromMin(drag.min)}
                </div>
              )}
            </div>
          )
        })}
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
