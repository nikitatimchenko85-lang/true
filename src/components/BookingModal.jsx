import { useEffect, useMemo, useState } from 'react'
import { ConflictError, store } from '../store.js'
import {
  RADII, TAGS, TIRE_CLASSES, bannedBrand, computeEnd, findConflict, formatDuration, formatPhone, fromMin,
  humanStamp, normalizePhone, splitStamp, stamp, statusesFor, workMinutes,
} from '../lib.js'
import Modal from './Modal.jsx'

// Форма записи. Обязательна только машина; пост и время приходят из места касания.
export default function BookingModal({ initial, depts, allDepts, bookings, employee, onClose, onSaved, onChain }) {
  const isNew = !initial.id
  const deptOf = (id) => allDepts.find((d) => d.id === id)

  const [f, setF] = useState(() => {
    if (!isNew) return { tags: [], ...initial }
    const dept = deptOf(initial.service_id) || depts[0]
    const starts_at = stamp(initial.date, initial.min)
    let post = initial.post
    if (!post) {
      // "+ Записать" без выбора поста: первый свободный на это время
      post = dept.posts.findIndex((p, i) =>
        !findConflict(bookings, { service_id: dept.id, post: i + 1, starts_at, ends_at: computeEnd(starts_at, p.duration, dept), status: 'planned' }),
      ) + 1 || 1
    }
    return {
      service_id: dept.id,
      post,
      starts_at,
      ends_at: computeEnd(starts_at, initial.duration || dept.posts[post - 1]?.duration || 60, dept),
      car: initial.car || '',
      client_name: initial.client_name || '',
      phone: initial.phone || '',
      work: '',
      tire_class: '',
      radius: '',
      tags: [],
      comment: '',
      status: 'planned',
    }
  })
  const [durTouched, setDurTouched] = useState(!isNew)
  const [error, setError] = useState('')
  const [warnOk, setWarnOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))

  const dept = deptOf(f.service_id)
  const post = dept.posts[f.post - 1]
  const duration = workMinutes(f.starts_at, f.ends_at, dept)
  const start = splitStamp(f.starts_at)
  const end = splitStamp(f.ends_at)
  const banned = bannedBrand(post, f.car)

  const setStart = (date, min) => {
    const s = stamp(date, min)
    set({ starts_at: s, ends_at: computeEnd(s, duration || post?.duration || 60, dept) })
  }
  const setDuration = (d) => {
    setDurTouched(true)
    set({ ends_at: computeEnd(f.starts_at, d, dept) })
  }
  const setPost = (n) => {
    const p = dept.posts[n - 1]
    set({ post: n, ...(durTouched ? {} : { ends_at: computeEnd(f.starts_at, p.duration, dept) }) })
    setWarnOk(false)
  }
  const setDept = (id) => {
    const d = deptOf(id)
    set({ service_id: id, post: 1, work: '', ends_at: computeEnd(f.starts_at, d.posts[0].duration, d) })
    setDurTouched(false)
  }
  const toggleTag = (t) => set({ tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] })

  const timeOptions = useMemo(() => {
    const out = []
    for (let m = dept.open_min; m <= dept.close_min; m += dept.step) out.push(m)
    return out
  }, [dept])
  const withCurrent = (list, m) => (list.includes(m) ? list : [...list, m].sort((a, b) => a - b))

  const dayLen = dept.close_min - dept.open_min
  const long = dept.posts.some((p) => p.duration >= 240)
  const presets = [30, 60, 90, 120, 180, 240, ...(long ? [dayLen, dayLen * 2, dayLen * 3] : [])]
  const durLabel = (d) => (d >= dayLen && d % dayLen === 0 ? `${d / dayLen} дн.` : formatDuration(d))

  const postInfo = dept.posts.map((p, i) => ({
    ...p,
    n: i + 1,
    conflict: findConflict(bookings, { ...f, status: 'planned', post: i + 1 }),
  }))
  const conflict = findConflict(bookings, f)

  // Прошлые визиты по телефону
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
    if (!f.car.trim()) return setError('Укажите машину')
    if (f.ends_at <= f.starts_at) return setError('Окончание должно быть позже начала')
    if (conflict) return setError(conflictText(conflict, dept))
    if (banned && !warnOk) {
      setWarnOk(true)
      return setError(`${banned} на «${post.name}» не записываем. Нажмите «Записать всё равно», если это согласовано.`)
    }
    const row = {
      ...f,
      car: f.car.trim(),
      client_name: f.client_name.trim(),
      created_by: f.created_by || employee || null,
    }
    setBusy(true)
    try {
      onSaved(await store.saveBooking(row))
    } catch (err) {
      setError(err instanceof ConflictError ? (err.booking ? conflictText(err.booking, dept) : err.message) : 'Ошибка: ' + err.message)
      setBusy(false)
    }
  }

  const otherDepts = depts.filter((d) => d.id !== f.service_id)

  return (
    <Modal title={isNew ? 'Новая запись' : 'Запись'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>
          Машина, госномер *
          <input
            value={f.car}
            onChange={(e) => {
              set({ car: e.target.value })
              setWarnOk(false)
            }}
            placeholder="Kia Rio 123"
            autoFocus={isNew}
            required
          />
        </label>
        {banned && <div className="warn">⚠ {banned} на «{post.name}» не записываем</div>}

        <div className="tagbar">
          {TAGS.map((t) => (
            <button type="button" key={t} className={f.tags.includes(t) ? 'on' : ''} onClick={() => toggleTag(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="row2">
          {isNew && depts.length > 1 ? (
            <label>
              Подразделение
              <select value={f.service_id} onChange={(e) => setDept(e.target.value)}>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Подразделение
              <input value={dept.name} disabled />
            </label>
          )}
          <label>
            Пост
            <select value={f.post} onChange={(e) => setPost(Number(e.target.value))}>
              {postInfo.map((p) => (
                <option key={p.n} value={p.n}>
                  {p.name} {p.conflict && p.conflict.id !== f.id ? '— занят' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row2">
          <label>
            Дата
            <input type="date" value={start.date} onChange={(e) => e.target.value && setStart(e.target.value, start.min)} required />
          </label>
          <label>
            Время
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
            Длительность: <b>{durLabel(duration)}</b> · до {humanStamp(f.ends_at)}
          </span>
          <div className="presets">
            {presets.map((d) => (
              <button type="button" key={d} className={d === duration ? 'on' : ''} onClick={() => setDuration(d)}>
                {durLabel(d)}
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

        {conflict && <div className="err">{conflictText(conflict, dept)}</div>}

        <div className="row2">
          <label>
            Клиент
            <input value={f.client_name} onChange={(e) => set({ client_name: e.target.value })} placeholder="Имя" />
          </label>
          <label>
            Телефон
            <input
              type="tel"
              value={f.phone}
              onChange={(e) => set({ phone: e.target.value })}
              onBlur={() => set({ phone: formatPhone(f.phone) })}
              placeholder="+7"
            />
          </label>
        </div>

        {last && (
          <div className="hint">
            Уже был {history.length} раз(а), последний — {humanStamp(last.starts_at)}: {last.car}
            {last.client_name ? `, ${last.client_name}` : ''}.{' '}
            {(!f.client_name || !f.car) && (
              <button
                type="button"
                className="link"
                onClick={() => set({ client_name: f.client_name || last.client_name || '', car: f.car || last.car || '' })}
              >
                Подставить
              </button>
            )}
          </div>
        )}

        {dept.works?.length > 0 && (
          <label>
            Вид работы
            <select value={f.work || ''} onChange={(e) => set({ work: e.target.value })}>
              <option value="">—</option>
              {dept.works.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
        )}

        {dept.tire_fields && (
          <div className="row2">
            <label>
              Класс
              <select value={f.tire_class || ''} onChange={(e) => set({ tire_class: e.target.value })}>
                <option value="">—</option>
                {TIRE_CLASSES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Радиус
              <select value={f.radius || ''} onChange={(e) => set({ radius: e.target.value })}>
                <option value="">—</option>
                {RADII.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label>
          Комментарий
          <textarea rows={2} value={f.comment || ''} onChange={(e) => set({ comment: e.target.value })} />
        </label>

        <div className="field">
          <span className="lbl">Статус</span>
          <div className="presets">
            {statusesFor(dept).map(([k, v]) => (
              <button type="button" key={k} className={f.status === k ? 'on' : ''} onClick={() => set({ status: k })}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {!isNew && f.created_by && <p className="muted small">Записал(а): {f.created_by}</p>}
        {!isNew && otherDepts.length > 0 && (
          <div className="chain">
            <span className="muted small">Записать эту машину дальше:</span>
            {otherDepts.map((d) => (
              <button
                type="button"
                key={d.id}
                style={{ '--c': d.color }}
                onClick={() => onChain({ service_id: d.id, ...splitStamp(f.ends_at), car: f.car, client_name: f.client_name, phone: f.phone })}
              >
                <i /> {d.name}
              </button>
            ))}
          </div>
        )}
        {error && !conflict && <div className="err">{error}</div>}

        <div className="buttons">
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" disabled={busy || !!conflict}>
            {busy ? 'Сохраняем…' : warnOk && banned ? 'Записать всё равно' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const conflictText = (c, dept) =>
  `Пост занят: ${c.car}, ${humanStamp(c.starts_at)} — ${humanStamp(c.ends_at)}` +
  (dept?.posts[c.post - 1] ? ` (${dept.posts[c.post - 1].name})` : '') +
  '. Выберите другое время или пост.'
