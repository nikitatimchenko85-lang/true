import { useState } from 'react'
import { store } from '../store.js'
import { fromMin, uid } from '../lib.js'
import { parseCsv, rowsToBookings } from '../importCsv.js'
import Modal from './Modal.jsx'

const HOURS = Array.from({ length: 25 }, (_, h) => h * 60)
const COLORS = ['#16a34a', '#0891b2', '#d97706', '#7c3aed', '#db2777', '#dc2626', '#64748b', '#2563eb']
const listToText = (l) => (l || []).join(', ')
const textToList = (t) => t.split(',').map((x) => x.trim()).filter(Boolean)

export default function SettingsModal({ config, me, onMe, onClose, onSaved }) {
  const [cfg, setCfg] = useState(() => structuredClone(config))
  const [admins, setAdmins] = useState(listToText(config.admins))
  const [name, setName] = useState(me)
  const [open, setOpen] = useState(null) // id подразделения, раскрытого для правки
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const updDept = (i, patch) => setCfg((c) => ({ ...c, departments: c.departments.map((d, j) => (j === i ? { ...d, ...patch } : d)) }))
  const updPost = (i, k, patch) =>
    updDept(i, { posts: cfg.departments[i].posts.map((p, j) => (j === k ? { ...p, ...patch } : p)) })
  const addDept = () => {
    const id = uid().slice(0, 8)
    setCfg((c) => ({
      ...c,
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

  const save = async (e) => {
    e.preventDefault()
    for (const d of cfg.departments) {
      if (!d.name.trim()) return setError('У каждого подразделения должно быть название')
      if (d.close_min <= d.open_min) return setError(`${d.name}: закрытие должно быть позже открытия`)
      if (!d.posts.length || d.posts.some((p) => !p.name.trim())) return setError(`${d.name}: у каждого поста должно быть название`)
    }
    setBusy(true)
    try {
      await store.saveConfig({
        ...cfg,
        admins: textToList(admins),
        departments: cfg.departments.map((d) => ({
          ...d,
          posts: d.posts.map((p) => ({ ...p, duration: Math.max(15, Number(p.duration) || 60) })),
        })),
      })
      onMe(name.trim())
      onSaved()
    } catch (err) {
      setError('Ошибка: ' + err.message)
      setBusy(false)
    }
  }

  const adminList = textToList(admins)

  return (
    <Modal title="Настройки" onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <h3>Кто записывает на этом устройстве</h3>
        <div className="presets">
          {adminList.map((a) => (
            <button type="button" key={a} className={name === a ? 'on' : ''} onClick={() => setName(a)}>
              {a}
            </button>
          ))}
        </div>
        <label>
          Или впишите имя
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <h3>Подразделения и посты</h3>
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
                <p className="muted small">
                  Убирать можно только последние посты: записи привязаны к номеру поста.
                </p>
                <label>
                  Виды работ (через запятую)
                  <textarea rows={2} value={listToText(d.works)} onChange={(e) => updDept(i, { works: textToList(e.target.value) })} />
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

        <h3>Администраторы</h3>
        <label>
          Через запятую
          <input value={admins} onChange={(e) => setAdmins(e.target.value)} />
        </label>

        {error && <div className="err">{error}</div>}
        <div className="buttons">
          <span className="spacer" />
          <button type="button" onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </form>

      <ImportSection config={config} />
    </Modal>
  )
}

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
    <div className="form import">
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
