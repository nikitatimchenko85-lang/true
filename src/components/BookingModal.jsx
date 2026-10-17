import { useEffect, useMemo, useState } from 'react'
import { ConflictError, store } from '../store.js'
import {
  STATUSES, computeEnd, findConflict, formatDuration, formatPhone, fromMin, humanStamp,
  normalizePhone, splitStamp, stamp, workMinutes,
} from '../lib.js'
import Modal from './Modal.jsx'

export default function BookingModal({ initial, services, allServices, settings, bookings, employee, onClose, onSaved }) {
  const isNew = !initial.id
  const [f, setF] = useState(() => {
    if (!isNew) return { ...initial, price: initial.price ?? '' }
    const svc = services.find((s) => s.id === initial.service_id) || services[0]
    const starts_at = stamp(initial.date, initial.min)
    return {
      service_id: svc?.id,
      post: initial.post || 0,
      starts_at,
      ends_at: computeEnd(starts_at, svc?.duration || 60, settings),
      client_name: '',
      phone: '',
      car: '',
      plate: '',
      price: '',
      comment: '',
      status: 'planned',
    }
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))

  const svcList = isNew ? services : allServices
  const service = allServices.find((s) => s.id === f.service_id)
  const duration = workMinutes(f.starts_at, f.ends_at, settings)
  const start = splitStamp(f.starts_at)
  const end = splitStamp(f.ends_at)

  const setStart = (date, min) => {
    const s = stamp(date, min)
    set({ starts_at: s, ends_at: computeEnd(s, duration || service?.duration || 60, settings) })
  }
  const setDuration = (d) => set({ ends_at: computeEnd(f.starts_at, d, settings) })

  const timeOptions = useMemo(() => {
    const out = []
    for (let m = settings.open_min; m <= settings.close_min; m += settings.step) out.push(m)
    return out
  }, [settings])
  const withCurrent = (list, m) => (list.includes(m) ? list : [...list, m].sort((a, b) => a - b))

  const dayLen = settings.close_min - settings.open_min
  const presets = [30, 60, 90, 120, 180, 240, dayLen, dayLen * 2, dayLen * 3]
  const presetLabel = (d) => (d >= dayLen && d % dayLen === 0 ? `${d / dayLen} дн.` : formatDuration(d))

  // Занятость постов выбранной услуги на выбранное время
  const postInfo = service
    ? Array.from({ length: service.posts }, (_, i) => ({
        post: i + 1,
        conflict: findConflict(bookings, { ...f, status: 'planned', post: i + 1 }),
      }))
    : []

  // Подсказка по прошлым визитам клиента
  const [history, setHistory] = useState([])
  const phoneDigits = normalizePhone(f.phone)
  useEffect(() => {
    if (phoneDigits.length < 10) return setHistory([])
    const t = setTimeout(() => {
      store
        .searchBookings(phoneDigits.slice(-10))
        .then((r) => setHistory(r.filter((b) => b.id !== f.id)))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [phoneDigits, f.id])
  const last = history[0]

  const save = async (e) => {
    e?.preventDefault()
    setError('')
    if (!f.client_name.trim()) return setError('Укажите имя клиента')
    if (f.ends_at <= f.starts_at) return setError('Окончание должно быть позже начала')
    let post = Number(f.post)
    if (!post) {
      const free = postInfo.find((p) => !p.conflict)
      if (!free) return setError('На это время все посты заняты. Выберите другое время.')
      post = free.post
    }
    const row = {
      ...f,
      post,
      client_name: f.client_name.trim(),
      price: f.price === '' ? null : Number(f.price),
      created_by: f.created_by || employee || null,
    }
    const c = findConflict(bookings, row)
    if (c) return setError(conflictText(c))
    setBusy(true)
    try {
      const saved = await store.saveBooking(row)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ConflictError ? (err.booking ? conflictText(err.booking) : err.message) : 'Ошибка: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Удалить запись «${f.client_name}»? Лучше поставить статус «Отменена», чтобы осталась история.`)) return
    setBusy(true)
    try {
      await store.deleteBooking(f.id)
      onSaved(f)
    } catch (err) {
      setError('Ошибка: ' + err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? 'Новая запись' : 'Запись'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="row2">
          <label>
            Услуга
            <select
              value={f.service_id}
              onChange={(e) => {
                const s = allServices.find((x) => x.id === e.target.value)
                set({ service_id: s.id, post: 0, ends_at: isNew ? computeEnd(f.starts_at, s.duration, settings) : f.ends_at })
              }}
            >
              {svcList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {service?.posts > 1 && (
            <label>
              Пост
              <select value={f.post} onChange={(e) => set({ post: Number(e.target.value) })}>
                <option value={0}>Любой свободный</option>
                {postInfo.map((p) => (
                  <option key={p.post} value={p.post}>
                    Пост {p.post} {p.conflict ? '— занят' : '— свободен'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="row2">
          <label>
            Дата
            <input type="date" value={start.date} onChange={(e) => e.target.value && setStart(e.target.value, start.min)} required />
          </label>
          <label>
            Начало
            <select value={start.min} onChange={(e) => setStart(start.date, Number(e.target.value))}>
              {withCurrent(timeOptions, start.min).map((m) => (
                <option key={m} value={m}>
                  {fromMin(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span className="lbl">
            Длительность: <b>{presetLabel(duration)}</b> · до {humanStamp(f.ends_at)}
          </span>
          <div className="presets">
            {presets.map((d) => (
              <button type="button" key={d} className={d === duration ? 'on' : ''} onClick={() => setDuration(d)}>
                {presetLabel(d)}
              </button>
            ))}
          </div>
          <details className="custom-end">
            <summary>Указать окончание вручную</summary>
            <div className="row2">
              <input type="date" value={end.date} onChange={(e) => e.target.value && set({ ends_at: stamp(e.target.value, end.min) })} />
              <select value={end.min} onChange={(e) => set({ ends_at: stamp(end.date, Number(e.target.value)) })}>
                {withCurrent(timeOptions, end.min).map((m) => (
                  <option key={m} value={m}>
                    {fromMin(m)}
                  </option>
                ))}
              </select>
            </div>
          </details>
        </div>

        <div className="row2">
          <label>
            Телефон
            <input
              type="tel"
              value={f.phone}
              onChange={(e) => set({ phone: e.target.value })}
              onBlur={() => set({ phone: formatPhone(f.phone) })}
              placeholder="+7 (___) ___-__-__"
              autoFocus={isNew}
            />
          </label>
          <label>
            Имя клиента *
            <input value={f.client_name} onChange={(e) => set({ client_name: e.target.value })} required />
          </label>
        </div>

        {last && (
          <div className="hint">
            Клиент уже был {history.length} раз(а), последний — {humanStamp(last.starts_at)}: {last.client_name}
            {last.car ? `, ${last.car}` : ''}
            {last.plate ? ` (${last.plate})` : ''}.{' '}
            {(!f.client_name || !f.car) && (
              <button
                type="button"
                className="link"
                onClick={() =>
                  set({ client_name: f.client_name || last.client_name, car: f.car || last.car || '', plate: f.plate || last.plate || '' })
                }
              >
                Подставить
              </button>
            )}
          </div>
        )}

        <div className="row2">
          <label>
            Автомобиль
            <input value={f.car} onChange={(e) => set({ car: e.target.value })} placeholder="Марка, модель" />
          </label>
          <label>
            Госномер
            <input value={f.plate} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} placeholder="А123АА77" />
          </label>
        </div>

        <div className="row2">
          <label>
            Стоимость, ₽
            <input type="number" min="0" step="100" value={f.price} onChange={(e) => set({ price: e.target.value })} />
          </label>
          <label>
            Статус
            <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {Object.entries(STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Комментарий
          <textarea rows={2} value={f.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="Что делаем, пожелания клиента" />
        </label>

        {!isNew && f.created_by && <p className="muted small">Записал(а): {f.created_by}</p>}
        {error && <div className="err">{error}</div>}

        <div className="buttons">
          {!isNew && (
            <button type="button" className="danger" onClick={remove} disabled={busy}>
              Удалить
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const conflictText = (c) =>
  `Время занято: ${c.client_name}, ${humanStamp(c.starts_at)} — ${humanStamp(c.ends_at)}` +
  (c.post ? ` (пост ${c.post})` : '') +
  '. Выберите другое время или пост.'
