import { useState } from 'react'
import { store } from '../store.js'
import { RADII, fromMin, tagsFor, uid } from '../lib.js'
import { PERMS, ROLES, can, rolePerms } from '../access.js'
import { DEFAULT_PRICELISTS, PRICE_CLASSES } from '../prices.js'
import { download, parsePricelist, pricelistCsv } from '../exports.js'
import { parseCsv, rowsToBookings } from '../importCsv.js'
import Modal from './Modal.jsx'

const HOURS = Array.from({ length: 25 }, (_, h) => h * 60)
const COLORS = ['#16a34a', '#0891b2', '#d97706', '#7c3aed', '#db2777', '#dc2626', '#64748b', '#2563eb']
const listToText = (l) => (l || []).join(', ')
const textToList = (t) => t.split(',').map((x) => x.trim()).filter(Boolean)

const TABS = [
  ['depts', 'Подразделения', 'settings'],
  ['users', 'Пользователи', 'users'],
  ['prices', 'Прайс-листы', 'pricelists'],
  ['import', 'Импорт', 'settings'],
]

export default function SettingsModal({ config, user, onClose, onSaved }) {
  const tabs = TABS.filter(([, , perm]) => can(user, perm))
  const [tab, setTab] = useState(tabs[0]?.[0])
  const [cfg, setCfg] = useState(() => structuredClone(config))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setError('')
    for (const d of cfg.departments) {
      if (!d.name.trim()) return setError('У каждого подразделения должно быть название')
      if (d.close_min <= d.open_min) return setError(`${d.name}: закрытие должно быть позже открытия`)
      if (!d.posts.length || d.posts.some((p) => !p.name.trim())) return setError(`${d.name}: у каждого поста должно быть название`)
    }
    const names = cfg.users.map((u) => u.name.trim())
    if (names.some((n) => !n)) return setError('У каждого пользователя должно быть имя')
    if (new Set(names).size !== names.length) return setError('Имена пользователей повторяются')
    if (!cfg.users.some((u) => u.role === 'owner')) return setError('Нужен хотя бы один руководитель')
    for (const [id, list] of Object.entries(cfg.pricelists)) {
      if (list.some((i) => !i.name.trim())) return setError(`Прайс «${cfg.departments.find((d) => d.id === id)?.name || id}»: у позиции нет названия`)
    }
    setBusy(true)
    try {
      await store.saveConfig({
        ...cfg,
        admins: cfg.users.map((u) => u.name.trim()),
        users: cfg.users.map((u) => ({ ...u, name: u.name.trim() })),
        departments: cfg.departments.map((d) => ({
          ...d,
          posts: d.posts.map((p) => ({ ...p, duration: Math.max(15, Number(p.duration) || 60) })),
        })),
      })
      onSaved()
    } catch (err) {
      setError('Ошибка: ' + err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Настройки" onClose={onClose} wide>
      <nav className="presets settings-tabs">
        {tabs.map(([id, name]) => (
          <button type="button" key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === 'import' ? (
        <ImportSection config={config} />
      ) : (
        <form className="form" onSubmit={save}>
          {tab === 'depts' && <DeptsTab cfg={cfg} setCfg={setCfg} />}
          {tab === 'users' && <UsersTab cfg={cfg} setCfg={setCfg} me={user} />}
          {tab === 'prices' && <PricesTab cfg={cfg} setCfg={setCfg} />}
          {error && <div className="err">{error}</div>}
          <div className="buttons sticky">
            <span className="spacer" />
            <button type="button" onClick={onClose}>Отмена</button>
            <button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/* ---------- Подразделения и посты ---------- */

function DeptsTab({ cfg, setCfg }) {
  const [open, setOpen] = useState(null) // id подразделения, раскрытого для правки
  const updDept = (i, patch) => setCfg((c) => ({ ...c, departments: c.departments.map((d, j) => (j === i ? { ...d, ...patch } : d)) }))
  const updPost = (i, k, patch) =>
    updDept(i, { posts: cfg.departments[i].posts.map((p, j) => (j === k ? { ...p, ...patch } : p)) })
  const addDept = () => {
    const id = uid().slice(0, 8)
    setCfg((c) => ({
      ...c,
      pricelists: { ...c.pricelists, [id]: [] },
      departments: [
        ...c.departments,
        {
          id, name: 'Новое подразделение', color: COLORS[c.departments.length % COLORS.length], step: 30,
          open_min: 540, close_min: 1260, active: true, works: [],
          posts: [{ name: 'Пост 1', entity: '', duration: 60, banned: '' }],
        },
      ],
    }))
    setOpen(id)
  }

  return (
    <>
      <p className="muted small">
        Пост — то, что занято одной машиной: пост, бокс, подъёмник. Записи на одном посту не пересекаются. Неактивные
        подразделения скрыты.
      </p>
      {cfg.departments.map((d, i) => (
        <div key={d.id} className={`dept-card ${d.active === false ? 'off' : ''}`}>
          <div className="dept-head">
            <input type="color" value={d.color} onChange={(e) => updDept(i, { color: e.target.value })} aria-label="Цвет" />
            <input value={d.name} onChange={(e) => updDept(i, { name: e.target.value })} />
            <label className="check">
              <input type="checkbox" checked={d.active !== false} onChange={(e) => updDept(i, { active: e.target.checked })} />
              вкл.
            </label>
            <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)}>
              {open === d.id ? 'Свернуть' : `${d.posts.length} пост.`}
            </button>
          </div>
          {open === d.id && (
            <div className="dept-body">
              <div className="row3">
                <label>
                  Сетка с
                  <select value={d.open_min} onChange={(e) => updDept(i, { open_min: Number(e.target.value) })}>
                    {HOURS.slice(0, 24).map((m) => <option key={m} value={m}>{fromMin(m)}</option>)}
                  </select>
                </label>
                <label>
                  до
                  <select value={d.close_min} onChange={(e) => updDept(i, { close_min: Number(e.target.value) })}>
                    {HOURS.slice(1).map((m) => <option key={m} value={m}>{m === 1440 ? '24:00' : fromMin(m)}</option>)}
                  </select>
                </label>
                <label>
                  Шаг
                  <select value={d.step} onChange={(e) => updDept(i, { step: Number(e.target.value) })}>
                    {[15, 30, 60].map((m) => <option key={m} value={m}>{m} мин</option>)}
                  </select>
                </label>
              </div>
              <div className="svc-row head">
                <span>Пост</span>
                <span>Юрлицо</span>
                <span>Мин.</span>
                <span>Не записываем</span>
                <span />
              </div>
              {d.posts.map((p, k) => (
                <div className="svc-row" key={k}>
                  <input value={p.name} onChange={(e) => updPost(i, k, { name: e.target.value })} />
                  <input value={p.entity || ''} onChange={(e) => updPost(i, k, { entity: e.target.value })} />
                  <input type="number" min="15" step="15" value={p.duration} onChange={(e) => updPost(i, k, { duration: e.target.value })} />
                  <input value={p.banned || ''} onChange={(e) => updPost(i, k, { banned: e.target.value })} placeholder="—" />
                  <button
                    type="button"
                    className="round sm"
                    disabled={d.posts.length === 1 || k !== d.posts.length - 1}
                    onClick={() => updDept(i, { posts: d.posts.filter((_, j) => j !== k) })}
                    aria-label="Убрать пост"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updDept(i, { posts: [...d.posts, { name: `Пост ${d.posts.length + 1}`, entity: '', duration: d.posts.at(-1)?.duration || 60, banned: '' }] })}
              >
                + Пост
              </button>
              <p className="muted small">Убирать можно только последние посты: записи привязаны к номеру поста.</p>
              <label>
                Виды работ (через запятую)
                <textarea rows={2} defaultValue={listToText(d.works)} onBlur={(e) => updDept(i, { works: textToList(e.target.value) })} />
              </label>
              <label>
                Быстрые пометки под госномером (через запятую)
                <textarea rows={2} defaultValue={listToText(tagsFor(d))} onBlur={(e) => updDept(i, { tags: textToList(e.target.value) })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={!!d.tire_fields} onChange={(e) => updDept(i, { tire_fields: e.target.checked })} />
                Поля «класс» и «радиус»
              </label>
              <label className="check">
                <input type="checkbox" checked={!!d.extended_statuses} onChange={(e) => updDept(i, { extended_statuses: e.target.checked })} />
                Статусы «в работе», «ждёт запчасти», «готово»
              </label>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={addDept}>+ Подразделение</button>
    </>
  )
}

/* ---------- Пользователи, роли, права ---------- */

function UsersTab({ cfg, setCfg, me }) {
  const [open, setOpen] = useState(null)
  const upd = (id, patch) => setCfg((c) => ({ ...c, users: c.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }))
  const add = () => {
    const id = 'u' + uid().slice(0, 8)
    setCfg((c) => ({ ...c, users: [...c.users, { id, name: '', role: 'admin', perms: null, depts: [], pin: '' }] }))
    setOpen(id)
  }
  const depts = cfg.departments

  return (
    <>
      <p className="muted small">
        Каждый входит под своим именем и PIN-кодом, имя попадает в записи. Роль задаёт права по умолчанию, их можно
        настроить вручную. Руководитель может всё.
      </p>
      {cfg.users.map((u) => {
        const perms = u.perms ?? rolePerms(u.role, cfg.roles)
        return (
          <div key={u.id} className="dept-card">
            <div className="user-head">
              <input value={u.name} onChange={(e) => upd(u.id, { name: e.target.value })} placeholder="Имя" aria-label="Имя" />
              <select value={u.role} onChange={(e) => upd(u.id, { role: e.target.value, perms: null })} aria-label="Роль">
                {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
              </select>
              <button type="button" onClick={() => setOpen(open === u.id ? null : u.id)}>
                {open === u.id ? 'Свернуть' : 'Права'}
              </button>
            </div>
            <div className="user-meta small">
              <span className={u.pin ? '' : 'muted'}>{u.pin ? 'PIN задан' : 'PIN придумает при первом входе'}</span>
              {u.pin && (
                <button type="button" className="link" onClick={() => upd(u.id, { pin: '' })}>
                  Сбросить PIN
                </button>
              )}
              <span className="muted">
                {u.depts?.length ? u.depts.map((id) => depts.find((d) => d.id === id)?.name).filter(Boolean).join(', ') : 'все подразделения'}
              </span>
            </div>
            {open === u.id && (
              <div className="dept-body">
                <div className="field">
                  <span className="lbl">Подразделения</span>
                  <div className="presets depts">
                    <button type="button" className={!u.depts?.length ? 'on' : ''} onClick={() => upd(u.id, { depts: [] })}>
                      Все
                    </button>
                    {depts.map((d) => {
                      const on = u.depts?.includes(d.id)
                      return (
                        <button
                          type="button"
                          key={d.id}
                          className={on ? 'on' : ''}
                          style={{ '--c': d.color }}
                          onClick={() => upd(u.id, { depts: on ? u.depts.filter((x) => x !== d.id) : [...(u.depts || []), d.id] })}
                        >
                          <i /> {d.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {u.role === 'owner' ? (
                  <p className="muted small">Руководителю доступно всё.</p>
                ) : (
                  <div className="perms">
                    {PERMS.map(([k, label]) => (
                      <label className="check" key={k}>
                        <input
                          type="checkbox"
                          checked={perms.includes(k)}
                          onChange={(e) => upd(u.id, { perms: e.target.checked ? [...perms, k] : perms.filter((x) => x !== k) })}
                        />
                        {label}
                      </label>
                    ))}
                    {u.perms && (
                      <button type="button" className="link" onClick={() => upd(u.id, { perms: null })}>
                        Вернуть права роли «{ROLES[u.role].label}»
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="danger"
                  disabled={u.id === me.id}
                  title={u.id === me.id ? 'Нельзя удалить себя' : ''}
                  onClick={() => setCfg((c) => ({ ...c, users: c.users.filter((x) => x.id !== u.id) }))}
                >
                  Удалить пользователя
                </button>
              </div>
            )}
          </div>
        )
      })}
      <button type="button" onClick={add}>+ Пользователь</button>

      <label>
        Блокировать экран без действий через
        <select value={cfg.lock_min ?? 30} onChange={(e) => setCfg((c) => ({ ...c, lock_min: Number(e.target.value) }))}>
          {[5, 15, 30, 60, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} мин` : `${m / 60} ч`}</option>)}
          <option value={0}>Не блокировать</option>
        </select>
      </label>
      <p className="muted small">
        Пока база Supabase не подключена, PIN-коды и права проверяются в браузере: это защита от случайных действий, а
        не от взлома.
      </p>
    </>
  )
}

/* ---------- Прайс-листы ---------- */

const KINDS = { fixed: 'Одна цена', radius: 'По радиусу', class_radius: 'Класс × радиус' }
const n = (v) => (v === '' || v == null ? undefined : Number(v))

function PricesTab({ cfg, setCfg }) {
  const depts = cfg.departments
  const [deptId, setDeptId] = useState(depts[0]?.id)
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState('')
  const list = cfg.pricelists[deptId] || []
  const dept = depts.find((d) => d.id === deptId)
  const sized = !!dept?.tire_fields // цена по радиусу и классу — только там, где в заявке есть класс и радиус
  const setList = (l) => setCfg((c) => ({ ...c, pricelists: { ...c.pricelists, [deptId]: l } }))
  const upd = (i, patch) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i, dir) => {
    const l = [...list]
    ;[l[i], l[i + dir]] = [l[i + dir], l[i]]
    setList(l)
  }
  const setKind = (i, kind) => {
    const it = list[i]
    upd(i, { kind, ...(kind === 'radius' && !it.prices ? { prices: {} } : {}), ...(kind === 'class_radius' && !it.matrix ? { matrix: {} } : {}) })
  }
  const add = () => {
    const id = 'p' + uid().slice(0, 6)
    setList([...list, { id, name: '', unit: 'шт', qty: 1, kind: 'fixed', price: undefined, from: false }])
    setOpen(id)
  }
  const onFile = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    const { list: parsed, errors } = parsePricelist(parseCsv(await file.text()))
    if (!parsed.length) return setMsg('В файле нет позиций. ' + errors.join('; '))
    setList(parsed)
    setMsg(`Загружено позиций: ${parsed.length}.${errors.length ? ' Замечания: ' + errors.slice(0, 5).join('; ') : ''} Нажмите «Сохранить».`)
  }

  return (
    <>
      <div className="presets depts">
        {depts.map((d) => (
          <button type="button" key={d.id} className={deptId === d.id ? 'on' : ''} style={{ '--c': d.color }} onClick={() => setDeptId(d.id)}>
            <i /> {d.name} <small>{cfg.pricelists[d.id]?.length || 0}</small>
          </button>
        ))}
      </div>
      <p className="muted small">
        Первые восемь позиций показываются в заявке кнопками, остальные — списком. «Кол-во» подставляется в заявку
        (например, 4 колеса). Цена «от» помечается в итоге.
      </p>

      {list.map((it, i) => (
        <div className="dept-card" key={it.id}>
          <div className="price-head">
            <input value={it.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Название услуги" aria-label="Название" />
            {it.kind === 'fixed' || !sized ? (
              <input type="number" min="0" value={it.price ?? ''} onChange={(e) => upd(i, { price: n(e.target.value), kind: 'fixed' })} placeholder="₽" aria-label="Цена" />
            ) : (
              <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)}>
                {open === it.id ? 'Свернуть' : 'Цены'}
              </button>
            )}
            <button type="button" className="round sm" onClick={() => setOpen(open === it.id ? null : it.id)} aria-label="Ещё">
              ⋯
            </button>
          </div>
          {open === it.id && (
            <div className="dept-body">
              <div className={sized ? 'row3' : 'row2'}>
                {sized && (
                  <label>
                    Тип цены
                    <select value={it.kind} onChange={(e) => setKind(i, e.target.value)}>
                      {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  Единица
                  <input value={it.unit || ''} onChange={(e) => upd(i, { unit: e.target.value })} />
                </label>
                <label>
                  Кол-во в заявке
                  <input type="number" min="1" value={it.qty ?? 1} onChange={(e) => upd(i, { qty: n(e.target.value) || 1 })} />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" checked={!!it.from} onChange={(e) => upd(i, { from: e.target.checked })} />
                Цена «от»
              </label>
              {sized && it.kind === 'radius' && (
                <div className="radius-grid">
                  {RADII.map((r) => (
                    <label key={r}>
                      {r}
                      <input type="number" min="0" value={it.prices?.[r] ?? ''} onChange={(e) => upd(i, { prices: { ...it.prices, [r]: n(e.target.value) } })} />
                    </label>
                  ))}
                </div>
              )}
              {sized && it.kind === 'class_radius' && (
                <div className="matrix">
                  <table>
                    <thead>
                      <tr>
                        <th />
                        {RADII.map((r) => <th key={r}>{r}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {PRICE_CLASSES.map((c) => (
                        <tr key={c}>
                          <th>{c}</th>
                          {RADII.map((r) => (
                            <td key={r}>
                              <input
                                type="number"
                                min="0"
                                value={it.matrix?.[c]?.[r] ?? ''}
                                onChange={(e) => upd(i, { matrix: { ...it.matrix, [c]: { ...it.matrix?.[c], [r]: n(e.target.value) } } })}
                                aria-label={`${c} ${r}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="presets">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)}>↑ Выше</button>
                <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓ Ниже</button>
                <button type="button" className="danger" onClick={() => setList(list.filter((_, j) => j !== i))}>Удалить</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {!list.length && <p className="muted">В прайсе «{dept?.name}» пока нет позиций.</p>}

      <div className="presets">
        <button type="button" onClick={add}>+ Позиция</button>
        <button type="button" onClick={() => download(`true-price-${deptId}.csv`, pricelistCsv(list))} disabled={!list.length}>
          Выгрузить в Excel
        </button>
        <label className="file-btn">
          Загрузить из Excel (CSV)
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
        {DEFAULT_PRICELISTS[deptId]?.length > 0 && (
          <button type="button" onClick={() => setList(structuredClone(DEFAULT_PRICELISTS[deptId]))}>
            Вернуть прайс из брифа
          </button>
        )}
      </div>
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

/* ---------- Импорт записей ---------- */

function ImportSection({ config }) {
  const depts = config.departments
  const [dept, setDept] = useState(depts[0]?.id)
  const [parsed, setParsed] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setResult(null)
    const d = depts.find((x) => x.id === dept)
    setParsed(rowsToBookings(parseCsv(await file.text()), d))
  }
  const run = async () => {
    setBusy(true)
    try {
      setResult(await store.importBookings(parsed.bookings))
      setParsed(null)
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form">
      <h3>Загрузить записи из Google Таблицы</h3>
      <p className="muted small">
        Откройте лист «Заявки Шиномонтаж» → Файл → Скачать → CSV, затем выберите файл здесь. Записи на занятое время
        пропускаются.
      </p>
      <div className="row2">
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
      </div>
      {parsed && (
        <div className="hint">
          Найдено записей: {parsed.bookings.length}.
          {parsed.errors.length > 0 && ` Не разобрано строк: ${parsed.errors.length} (${parsed.errors.slice(0, 5).map((x) => `стр. ${x.line}: ${x.reason}`).join('; ')}).`}{' '}
          <button type="button" className="link" disabled={busy || !parsed.bookings.length} onClick={run}>
            {busy ? 'Загружаем…' : 'Загрузить'}
          </button>
        </div>
      )}
      {result && (
        <div className={result.error ? 'err' : 'hint'}>
          {result.error
            ? `Ошибка: ${result.error}`
            : `Загружено: ${result.added}. Пропущено из-за пересечений: ${result.skipped.length}` +
              (result.skipped.length ? ` (${result.skipped.slice(0, 5).map((b) => `${b.car} ${b.starts_at.replace('T', ' ')}`).join('; ')})` : '')}
        </div>
      )}
    </div>
  )
}
