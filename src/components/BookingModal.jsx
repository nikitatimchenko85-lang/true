import { useEffect, useMemo, useRef, useState } from 'react'
import { ConflictError, store } from '../store.js'
import {
  RADII, TAGS, TIRE_CLASSES, bannedBrand, computeEnd, findConflict, formatDuration, formatPhone, fromMin,
  humanStamp, nextFreeSlots, normalizePhone, splitStamp, stamp, statusesFor, today, weekday, workMinutes,
} from '../lib.js'
import { lineFromItem, lineSum, linesTotal, repriceLines, rub, unitPrice } from '../prices.js'
import { can } from '../access.js'
import Modal from './Modal.jsx'

const QUICK = 8 // сколько услуг из прайса показывать кнопками

// Форма записи. Обязательна только машина; пост и время приходят из места касания или ближайшего окна.
export default function BookingModal({ initial, depts, allDepts, bookings, user, pricelists, onClose, onSaved, onChain }) {
  const isNew = !initial.id
  const deptOf = (id) => allDepts.find((d) => d.id === id)
  const canEdit = can(user, 'book')
  const canStatus = canEdit || can(user, 'status')
  const canPrice = can(user, 'price')

  const [f, setF] = useState(() => {
    if (!isNew) return { tags: [], items: [], ...initial }
    const dept = deptOf(initial.service_id) || depts[0]
    const starts_at = stamp(initial.date, initial.min)
    let post = initial.post
    if (!post) {
      // «Записать» без выбора поста: первый свободный на это время
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
      tire_class: initial.tire_class || '',
      radius: initial.radius || '',
      tags: [],
      comment: '',
      status: 'planned',
      items: initial.items || [],
    }
  })
  const [durTouched, setDurTouched] = useState(!isNew)
  const [error, setError] = useState('')
  const [warnOk, setWarnOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const formRef = useRef(null)

  const dept = deptOf(f.service_id)
  const post = dept.posts[f.post - 1]
  const list = pricelists?.[dept.id] || []
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
    set({ service_id: id, post: 1, work: '', items: [], ends_at: computeEnd(f.starts_at, d.posts[0].duration, d) })
    setDurTouched(false)
  }
  const pickSlot = (s) => {
    set({ post: s.post, starts_at: s.starts_at, ends_at: durTouched ? computeEnd(s.starts_at, duration, dept) : s.ends_at })
    setWarnOk(false)
  }
  const toggleTag = (t) => set({ tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] })

  // Класс и радиус пересчитывают цены в заявке
  const setSize = (patch) => {
    const next = { tire_class: f.tire_class, radius: f.radius, ...patch }
    set({ ...patch, items: repriceLines(f.items || [], list, next.tire_class, next.radius) })
  }
  const items = f.items || []
  const hasItem = (id) => items.some((l) => l.item_id === id)
  const toggleItem = (item) =>
    set({ items: hasItem(item.id) ? items.filter((l) => l.item_id !== item.id) : [...items, lineFromItem(item, f.tire_class, f.radius)] })
  const updLine = (i, patch) => set({ items: items.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const total = linesTotal(items)
  const hasFrom = items.some((l) => l.from && !l.own)

  const timeOptions = useMemo(() => {
    const out = []
    for (let m = dept.open_min; m <= dept.close_min; m += dept.step) out.push(m)
    return out
  }, [dept])
  const withCurrent = (opts, m) => (opts.includes(m) ? opts : [...opts, m].sort((a, b) => a - b))

  const dayLen = dept.close_min - dept.open_min
  const long = dept.posts.some((p) => p.duration >= 240)
  const presets = [30, 60, 90, 120, 180, 240, ...(long ? [dayLen, dayLen * 2, dayLen * 3] : [])]
  const durLabel = (d) => (d >= dayLen && d % dayLen === 0 ? `${d / dayLen} дн.` : formatDuration(d))

  const postBusy = dept.posts.map((_, i) => {
    const c = findConflict(bookings, { ...f, status: 'planned', post: i + 1 })
    return c && c.id !== f.id
  })
  const conflict = findConflict(bookings, f)

  // Ближайшие свободные окна — от текущего времени, если смотрим сегодня
  const now = new Date()
  const slotFrom = start.date === today() ? stamp(start.date, now.getHours() * 60 + now.getMinutes()) : stamp(start.date, 0)
  const slotDur = durTouched ? duration : null
  const slots = useMemo(
    () => nextFreeSlots(bookings, dept, slotFrom, { duration: slotDur, count: 6, id: f.id, car: f.car }),
    [bookings, dept, slotFrom, slotDur, f.id, f.car],
  )

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

  // Подсказки по машине из прошлых записей: одним касанием подставить клиента, телефон, класс и радиус
  const [carHints, setCarHints] = useState([])
  const [carFocus, setCarFocus] = useState(false)
  useEffect(() => {
    const q = f.car.trim()
    if (!isNew || q.length < 2) return setCarHints([])
    const t = setTimeout(() => {
      store
        .searchBookings(q)
        .then((r) => {
          const seen = new Set()
          setCarHints(
            r.filter((b) => {
              const k = b.car.toLowerCase()
              if (seen.has(k) || k === q.toLowerCase()) return false
              seen.add(k)
              return b.car.toLowerCase().includes(q.toLowerCase()) || normalizePhone(b.phone).includes(normalizePhone(q) || '—')
            }).slice(0, 5),
          )
        })
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [f.car, isNew])
  const fillFrom = (b) => {
    const patch = {
      car: b.car,
      client_name: f.client_name || b.client_name || '',
      phone: f.phone || b.phone || '',
      tire_class: f.tire_class || b.tire_class || '',
      radius: f.radius || b.radius || '',
    }
    set({ ...patch, items: repriceLines(items, list, patch.tire_class, patch.radius) })
    setCarHints([])
  }

  const save = async (e) => {
    e?.preventDefault()
    setError('')
    if (!canEdit) {
      if (!canStatus || f.status === initial.status) return onClose()
      return persist({ ...initial, status: f.status })
    }
    if (!f.car.trim()) return setError('Укажите машину')
    if (f.ends_at <= f.starts_at) return setError('Окончание должно быть позже начала')
    if (conflict) return setError(conflictText(conflict, dept))
    if (banned && !warnOk) {
      setWarnOk(true)
      return setError(`${banned} на «${post.name}» не записываем. Нажмите «Записать всё равно», если это согласовано.`)
    }
    const clean = items.filter((l) => l.name?.trim()).map((l) => ({ ...l, qty: Number(l.qty) || 0, price: l.price === '' || l.price == null ? null : Number(l.price) }))
    persist({
      ...f,
      // вид работы для выгрузки в таблицу: выбранный или услуги из расчёта
      work: f.work || clean.map((l) => l.name.trim()).join(', '),
      car: f.car.trim(),
      client_name: f.client_name.trim(),
      items: clean,
      total: clean.length ? linesTotal(clean) : null,
      created_by: f.created_by || user?.name || null,
    })
  }
  const persist = async (row) => {
    setBusy(true)
    try {
      onSaved(await store.saveBooking(row))
    } catch (err) {
      setError(err instanceof ConflictError ? (err.booking ? conflictText(err.booking, dept) : err.message) : 'Ошибка: ' + err.message)
      setBusy(false)
    }
  }

  // Ctrl/⌘ + Enter — сохранить из любого поля, в том числе из комментария
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  const otherDepts = depts.filter((d) => d.id !== f.service_id)
  const slotLabel = (s) => {
    const { date, min } = splitStamp(s.starts_at)
    return `${date === start.date ? '' : weekday(date) + ' '}${fromMin(min)}`
  }
  const quick = list.slice(0, QUICK)
  const more = list.slice(QUICK)

  return (
    <Modal title={isNew ? 'Новая запись' : 'Запись'} onClose={onClose}>
      <form className="form booking-form" onSubmit={save} onKeyDown={onKeyDown} ref={formRef}>
        <fieldset disabled={!canEdit}>
          <div className="car-field">
            <label>
              Машина, госномер *
              <input
                value={f.car}
                onChange={(e) => {
                  set({ car: e.target.value })
                  setWarnOk(false)
                }}
                onFocus={() => setCarFocus(true)}
                onBlur={() => setTimeout(() => setCarFocus(false), 150)}
                placeholder="Kia Rio 123"
                autoFocus={isNew}
                autoComplete="off"
                required
              />
            </label>
            {carFocus && carHints.length > 0 && (
              <ul className="suggest">
                {carHints.map((b) => (
                  <li key={b.id}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fillFrom(b)}>
                      <b>{b.car}</b>
                      <span className="muted">
                        {[b.client_name, b.phone && formatPhone(b.phone), [b.tire_class, b.radius].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {banned && <div className="warn">⚠ {banned} на «{post.name}» не записываем</div>}

          <div className="tagbar">
            {TAGS.map((t) => (
              <button type="button" key={t} className={f.tags.includes(t) ? 'on' : ''} onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </div>

          {isNew && depts.length > 1 && (
            <div className="field">
              <span className="lbl">Подразделение</span>
              <div className="presets depts">
                {depts.map((d) => (
                  <button type="button" key={d.id} className={f.service_id === d.id ? 'on' : ''} style={{ '--c': d.color }} onClick={() => setDept(d.id)}>
                    <i /> {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(isNew || conflict) && slots.length > 0 && (
            <div className="field">
              <span className="lbl">Ближайшее свободное</span>
              <div className="presets slots">
                {slots.map((s) => (
                  <button
                    type="button"
                    key={s.starts_at + s.post}
                    className={f.starts_at === s.starts_at && f.post === s.post ? 'on' : ''}
                    onClick={() => pickSlot(s)}
                  >
                    <b>{slotLabel(s)}</b> <small>{dept.posts[s.post - 1]?.name}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <span className="lbl">Пост{!isNew && `: ${dept.name}`}</span>
            <div className="presets posts">
              {dept.posts.map((p, i) => (
                <button
                  type="button"
                  key={i}
                  className={`${f.post === i + 1 ? 'on' : ''} ${postBusy[i] ? 'busy' : ''}`}
                  onClick={() => setPost(i + 1)}
                  title={postBusy[i] ? 'Занят в это время' : p.entity ? `Юрлицо: ${p.entity}` : ''}
                >
                  {p.name}
                  {postBusy[i] && <small> · занят</small>}
                  {p.banned && !postBusy[i] && <small> · без {p.banned}</small>}
                </button>
              ))}
            </div>
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
              {(!f.client_name || !f.car || (dept.tire_fields && !f.radius && last.radius)) && (
                <button type="button" className="link" onClick={() => fillFrom({ ...last, car: f.car || last.car })}>
                  Подставить
                </button>
              )}
            </div>
          )}

          {dept.works?.length > 0 && list.length === 0 && <WorkChips works={dept.works} value={f.work} onChange={(work) => set({ work })} />}

          {dept.tire_fields && (
            <>
              <div className="field">
                <span className="lbl">Класс</span>
                <div className="presets">
                  {TIRE_CLASSES.map((c) => (
                    <button type="button" key={c} className={f.tire_class === c ? 'on' : ''} onClick={() => setSize({ tire_class: f.tire_class === c ? '' : c })}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="lbl">Радиус</span>
                <div className="presets">
                  {RADII.map((r) => (
                    <button type="button" key={r} className={f.radius === r ? 'on' : ''} onClick={() => setSize({ radius: f.radius === r ? '' : r })}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {(list.length > 0 || items.length > 0) && (
            <div className="field cost">
              <span className="lbl">Услуги и стоимость</span>
              {quick.length > 0 && (
                <div className="presets">
                  {quick.map((i) => (
                    <button type="button" key={i.id} className={hasItem(i.id) ? 'on' : ''} onClick={() => toggleItem(i)}>
                      {i.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="add-line">
                {more.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const item = list.find((i) => i.id === e.target.value)
                      if (item && !hasItem(item.id)) toggleItem(item)
                    }}
                    aria-label="Другая услуга"
                  >
                    <option value="">+ Другая услуга из прайса</option>
                    {more.map((i) => (
                      <option key={i.id} value={i.id} disabled={hasItem(i.id)}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                )}
                {canPrice && (
                  <button type="button" onClick={() => set({ items: [...items, { item_id: null, name: '', qty: 1, price: '', own: true, from: false }] })}>
                    + Своя позиция
                  </button>
                )}
              </div>
              {items.length > 0 && (
                <div className="lines">
                  {items.map((l, i) => {
                    const item = list.find((x) => x.id === l.item_id)
                    const hint = item && l.price == null ? unitPrice(item, f.tire_class, f.radius).hint : ''
                    return (
                      <div className="line-row" key={i}>
                        {l.item_id ? (
                          <span className="line-name">
                            {l.name}
                            {hint && <small className="muted"> · {hint}</small>}
                          </span>
                        ) : (
                          <input value={l.name} onChange={(e) => updLine(i, { name: e.target.value })} placeholder="Название, скидка…" aria-label="Название" />
                        )}
                        <input type="number" min="0" value={l.qty} onChange={(e) => updLine(i, { qty: e.target.value })} aria-label="Количество" />
                        <input
                          type="number"
                          step="50"
                          value={l.price ?? ''}
                          disabled={!canPrice && l.price != null && !l.own}
                          onChange={(e) => updLine(i, { price: e.target.value === '' ? null : e.target.value, own: true })}
                          placeholder="цена"
                          aria-label="Цена за единицу"
                        />
                        <span className="line-sum">{l.price != null && l.price !== '' ? rub(lineSum(l)) : '—'}</span>
                        <button type="button" className="round sm" onClick={() => set({ items: items.filter((_, j) => j !== i) })} aria-label="Убрать">
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {dept.works?.length > 0 && list.length > 0 && (
            <details className="more" open={!!f.work && !items.length}>
              <summary>
                Вид работы для таблицы: <b>{f.work || (items.length ? items.map((l) => l.name).filter(Boolean).join(', ') : '—')}</b>
              </summary>
              <WorkChips works={dept.works} value={f.work} onChange={(work) => set({ work })} />
            </details>
          )}

          <label>
            Комментарий
            <textarea rows={1} value={f.comment || ''} onChange={(e) => set({ comment: e.target.value })} />
          </label>
        </fieldset>

        {!isNew && (
          <fieldset disabled={!canStatus}>
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
          </fieldset>
        )}

        {!isNew && f.created_by && <p className="muted small">Записал(а): {f.created_by}</p>}
        {!isNew && canEdit && otherDepts.length > 0 && (
          <div className="chain">
            <span className="muted small">Записать эту машину дальше:</span>
            {otherDepts.map((d) => (
              <button
                type="button"
                key={d.id}
                style={{ '--c': d.color }}
                onClick={() =>
                  onChain({ service_id: d.id, ...splitStamp(f.ends_at), car: f.car, client_name: f.client_name, phone: f.phone, tire_class: f.tire_class, radius: f.radius })
                }
              >
                <i /> {d.name}
              </button>
            ))}
          </div>
        )}
        {error && !conflict && <div className="err">{error}</div>}

        <div className="buttons sticky">
          {items.length > 0 ? (
            <span className="total">
              <small>Итого</small>
              <b>
                {hasFrom ? 'от ' : ''}
                {rub(total)}
              </b>
            </span>
          ) : (
            <span className="spacer" />
          )}
          <button type="button" onClick={onClose}>
            {canEdit || canStatus ? 'Отмена' : 'Закрыть'}
          </button>
          {(canEdit || canStatus) && (
            <button className="primary" disabled={busy || (canEdit && !!conflict)} title="Enter или Ctrl+Enter">
              {busy ? 'Сохраняем…' : warnOk && banned ? 'Записать всё равно' : 'Сохранить'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}

function WorkChips({ works, value, onChange }) {
  return (
    <div className="field">
      <span className="lbl">Вид работы</span>
      <div className="presets">
        {works.map((w) => (
          <button type="button" key={w} className={value === w ? 'on' : ''} onClick={() => onChange(value === w ? '' : w)}>
            {w}
          </button>
        ))}
      </div>
    </div>
  )
}

const conflictText = (c, dept) =>
  `Пост занят: ${c.car}, ${humanStamp(c.starts_at)} — ${humanStamp(c.ends_at)}` +
  (dept?.posts[c.post - 1] ? ` (${dept.posts[c.post - 1].name})` : '') +
  '. Выберите другое время или пост.'
