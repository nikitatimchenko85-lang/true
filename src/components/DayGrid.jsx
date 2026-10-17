import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STATUSES, clipToDay, fromMin, humanStamp, today } from '../lib.js'
import { rub } from '../prices.js'
import { haptic } from '../haptics.js'

const MAX_PX = 1.6 // пикселей на минуту — самый крупный масштаб
const HEAD = 72 // высота шапки сетки: подразделение + посты
const LONG_PRESS = 350

const readPx = () => {
  try {
    return Number(localStorage.getItem('grid.px')) || MAX_PX
  } catch {
    return MAX_PX
  }
}

// Сетка дня: колонки — посты выбранных подразделений.
// Запись можно перетащить на другое время или пост того же подразделения
// (мышью сразу, на телефоне — удержать палец).
export default function DayGrid({ date, depts, bookings, view, onCreate, onOpen, onMove, canMove, onPast }) {
  const { open_min, close_min, step } = view
  const wrapRef = useRef(null)

  // Масштаб: щипок двумя пальцами (или Ctrl + колесо/трекпад). Мельче всего — весь день в окне.
  const [px, setPx] = useState(readPx)
  const [minPx, setMinPx] = useState(0.3)
  const PX = Math.max(minPx, Math.min(MAX_PX, px))
  const zoom = useRef({ px: PX, min: minPx, anchor: null })
  zoom.current.px = PX
  zoom.current.min = minPx

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    // по max-height окна сетки, а не по текущей высоте — она сама зависит от масштаба
    const fit = () => {
      const h = parseFloat(getComputedStyle(el).maxHeight) || el.clientHeight
      setMinPx(Math.min(MAX_PX, Math.max(0.2, (h - HEAD - 12) / (close_min - open_min))))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open_min, close_min, depts.length])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const clamp = (v) => Math.max(zoom.current.min, Math.min(MAX_PX, v))
    const save = () => {
      try {
        localStorage.setItem('grid.px', String(zoom.current.px))
      } catch {}
    }
    // Точка под пальцами остаётся на месте
    const zoomAt = (clientY, next) => {
      const cy = clientY - el.getBoundingClientRect().top
      const minute = (el.scrollTop + cy - HEAD) / zoom.current.px
      zoom.current.anchor = { minute, cy }
      setPx(clamp(next))
    }
    let pinch = null
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const midY = (t) => (t[0].clientY + t[1].clientY) / 2
    const onStart = (e) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      pinch = { d: dist(e.touches), px: zoom.current.px }
    }
    const onMove = (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      zoomAt(midY(e.touches), (pinch.px * dist(e.touches)) / pinch.d)
    }
    const onEnd = (e) => {
      if (pinch && e.touches.length < 2) {
        pinch = null
        save()
      }
    }
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomAt(e.clientY, zoom.current.px * Math.exp(-e.deltaY / 150))
      save()
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  useLayoutEffect(() => {
    const a = zoom.current.anchor
    if (!a || !wrapRef.current) return
    wrapRef.current.scrollTop = a.minute * PX - a.cy + HEAD
    zoom.current.anchor = null
  }, [PX])

  const height = (close_min - open_min) * PX
  const nowMin = useNowMin()
  const [drag, setDrag] = useState(null) // { b, col, min, ok }
  const dragRef = useRef(null)
  const suppressClick = useRef(false)

  const columns = depts.flatMap((d) => d.posts.map((p, i) => ({ dept: d, post: i + 1, info: p })))

  // На телефоне первое касание выделяет окно, второе — открывает запись
  const [pick, setPick] = useState(null) // { key, min, dur }
  const touch = useRef(false)
  useEffect(() => setPick(null), [date, depts.length])

  useEffect(() => () => dragRef.current?.cleanup?.(), [])

  if (!depts.length) return <div className="empty">Выберите подразделение.</div>

  const hours = []
  for (let m = Math.ceil(open_min / 60) * 60; m < close_min; m += 60) hours.push(m)
  const lines = []
  for (let m = open_min; m < close_min; m += step) lines.push(m)

  // Прошедшее время: записывать нельзя (текущий слот ещё можно)
  const td = today()
  const pastUntil = date < td ? close_min : date > td ? open_min : Math.floor(nowMin / step) * step

  const clickColumn = (e, col) => {
    if (e.target !== e.currentTarget || suppressClick.current) return
    const min = open_min + Math.floor(e.nativeEvent.offsetY / PX / step) * step
    if (min < pastUntil) {
      setPick(null)
      return onPast?.()
    }
    const key = col.dept.id + col.post
    if (touch.current && !(pick?.key === key && pick.min === min)) {
      haptic('select')
      return setPick({ key, min, dur: col.info.duration || step })
    }
    setPick(null)
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
      haptic('select')
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
    <div className={`grid-wrap ${PX < 0.9 ? 'compact' : ''}`} ref={wrapRef}>
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
              onPointerDown={(e) => (touch.current = e.pointerType !== 'mouse')}
              onClick={(e) => clickColumn(e, col)}
              title="Нажмите на свободное место, чтобы записать"
            >
              {lines.filter((m) => PX >= 0.9 || m % 60 === 0).map((m) => (
                <div key={m} className={`line ${m % 60 === 0 ? 'hour' : ''}`} style={{ top: (m - open_min) * PX }} />
              ))}
              {outside.map((o) => (
                <div key={o.top} className="closed" style={{ top: o.top * PX, height: o.h * PX }} />
              ))}
              {pastUntil > open_min && <div className="past" style={{ top: 0, height: (Math.min(pastUntil, close_min) - open_min) * PX }} />}
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
                  const details = [b.work, b.tire_class, b.radius, b.total > 0 && rub(b.total)].filter(Boolean).join(' · ')
                  const note = [b.executor && `▸ ${b.executor}`, b.client_name, ...(b.tags || []), b.comment].filter(Boolean).join(' · ')
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
              {pick?.key === key && (
                <button
                  type="button"
                  className="pick"
                  style={{ top: (pick.min - open_min) * PX, height: Math.max(Math.min(pick.dur, close_min - pick.min) * PX - 2, 30) }}
                  onClick={() => {
                    setPick(null)
                    onCreate({ service_id: col.dept.id, post: col.post, date, min: pick.min })
                  }}
                >
                  <b>+ {fromMin(pick.min)}</b>
                  <small>нажмите ещё раз</small>
                </button>
              )}
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
