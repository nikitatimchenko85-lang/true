import { useState } from 'react'
import { store } from '../store.js'
import { fromMin, uid } from '../lib.js'
import Modal from './Modal.jsx'

const HOURS = Array.from({ length: 25 }, (_, h) => h * 60)
const COLORS = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#dc2626', '#4b5563']

export default function SettingsModal({ services, settings, me, onMe, onClose, onSaved }) {
  const [s, setS] = useState(settings)
  const [list, setList] = useState(() => [...services].sort((a, b) => a.sort - b.sort))
  const [name, setName] = useState(me)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const upd = (i, patch) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const add = () =>
    setList((l) => [
      ...l,
      { id: uid().slice(0, 8), name: '', color: COLORS[l.length % COLORS.length], duration: 60, posts: 1, sort: l.length + 1, active: true },
    ])

  const save = async (e) => {
    e.preventDefault()
    if (s.close_min <= s.open_min) return setError('Время закрытия должно быть позже открытия')
    if (list.some((x) => !x.name.trim())) return setError('У каждой услуги должно быть название')
    setBusy(true)
    try {
      const clean = list.map((x, i) => ({
        ...x,
        name: x.name.trim(),
        sort: i + 1,
        posts: Math.min(20, Math.max(1, Number(x.posts) || 1)),
        duration: Math.max(15, Number(x.duration) || 60),
      }))
      await store.saveServices(clean)
      await store.saveSettings(s)
      onMe(name.trim())
      onSaved()
    } catch (err) {
      setError('Ошибка: ' + err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Настройки" onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <label>
          Название
          <input value={s.company} onChange={(e) => setS({ ...s, company: e.target.value })} />
        </label>
        <div className="row3">
          <label>
            Открытие
            <select value={s.open_min} onChange={(e) => setS({ ...s, open_min: Number(e.target.value) })}>
              {HOURS.slice(0, 24).map((m) => (
                <option key={m} value={m}>{fromMin(m)}</option>
              ))}
            </select>
          </label>
          <label>
            Закрытие
            <select value={s.close_min} onChange={(e) => setS({ ...s, close_min: Number(e.target.value) })}>
              {HOURS.slice(1).map((m) => (
                <option key={m} value={m}>{m === 1440 ? '24:00' : fromMin(m)}</option>
              ))}
            </select>
          </label>
          <label>
            Шаг сетки
            <select value={s.step} onChange={(e) => setS({ ...s, step: Number(e.target.value) })}>
              {[15, 30, 60].map((m) => (
                <option key={m} value={m}>{m} мин</option>
              ))}
            </select>
          </label>
        </div>

        <h3>Услуги и посты</h3>
        <p className="muted small">
          «Постов» — сколько машин можно делать одновременно (боксы, подъёмники, мастера). Записи на одном посту не пересекаются.
        </p>
        <div className="svc-table">
          <div className="svc-row head">
            <span />
            <span>Название</span>
            <span>Время по умолч., мин</span>
            <span>Постов</span>
            <span>Вкл.</span>
          </div>
          {list.map((x, i) => (
            <div className="svc-row" key={x.id}>
              <input type="color" value={x.color} onChange={(e) => upd(i, { color: e.target.value })} aria-label="Цвет" />
              <input value={x.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Например, Тонировка" />
              <input type="number" min="15" step="15" value={x.duration} onChange={(e) => upd(i, { duration: e.target.value })} />
              <input type="number" min="1" max="20" value={x.posts} onChange={(e) => upd(i, { posts: e.target.value })} />
              <input type="checkbox" checked={x.active !== false} onChange={(e) => upd(i, { active: e.target.checked })} aria-label="Активна" />
            </div>
          ))}
        </div>
        <button type="button" onClick={add}>+ Добавить услугу</button>

        <h3>Этот сотрудник</h3>
        <label>
          Ваше имя (подписывается в новых записях на этом устройстве)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Андрей" />
        </label>

        {error && <div className="err">{error}</div>}
        <div className="buttons">
          <span className="spacer" />
          <button type="button" onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  )
}
