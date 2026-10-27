import { useState } from 'react'
import { store } from '../store.js'
import { uid } from '../lib.js'
import { cellsOf, isStored, newRack } from '../storage.js'
import Modal from './Modal.jsx'

const NUMS = Array.from({ length: 20 }, (_, i) => i + 1)

// Склады (контейнеры) и стеллажи в них. Стеллаж или склад с комплектами удалить нельзя, уменьшить — только до занятых ячеек
export default function WarehousesModal({ config, user, sets, onClose, onSaved }) {
  const [list, setList] = useState(() => structuredClone(config.warehouses))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stored = sets.filter(isStored)
  const used = (w, r) => stored.filter((s) => s.warehouse_id === w.id && (!r || s.rack_id === r.id))

  const updWh = (i, patch) => setList((l) => l.map((w, j) => (j === i ? { ...w, ...patch } : w)))
  const updRack = (i, k, patch) => updWh(i, { racks: list[i].racks.map((r, j) => (j === k ? { ...r, ...patch } : r)) })

  const save = async (e) => {
    e.preventDefault()
    setError('')
    for (const w of list) {
      if (!w.name.trim()) return setError('У каждого склада должно быть название')
      for (const r of w.racks) {
        if (!r.name.trim()) return setError(`${w.name}: у каждого стеллажа должно быть название`)
        const out = used(w, r).filter((s) => s.section > r.sections || s.level > r.levels)
        if (out.length) return setError(`${w.name}, стеллаж ${r.name}: в убранных ячейках лежат комплекты (${out.length}). Сначала переместите их.`)
      }
    }
    setBusy(true)
    try {
      const fresh = await store.getConfig()
      await store.saveConfig({ ...fresh, warehouses: list.map((w) => ({ ...w, name: w.name.trim() })) }, user.name)
      onSaved()
    } catch (err) {
      setError('Ошибка: ' + err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Склады" onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <p className="muted small">
          Склад — контейнер или помещение. В нём стеллажи: секции слева направо и ярусы снизу вверх. Адрес ячейки на бирке: стеллаж-секция-ярус,
          например А-2-3.
        </p>
        {list.map((w, i) => (
          <div key={w.id} className="dept-card">
            <div className="dept-head">
              <input value={w.name} onChange={(e) => updWh(i, { name: e.target.value })} aria-label="Название склада" />
              <span className="muted small">{cellsOf(w)} мест</span>
              <button type="button" disabled={used(w).length > 0} title={used(w).length ? 'На складе есть комплекты' : ''} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                Удалить
              </button>
            </div>
            <div className="dept-body">
              {w.racks.map((r, k) => (
                <div key={r.id} className="rack-row">
                  <label>
                    Стеллаж
                    <input value={r.name} onChange={(e) => updRack(i, k, { name: e.target.value })} />
                  </label>
                  <label>
                    Секций
                    <select value={r.sections} onChange={(e) => updRack(i, k, { sections: Number(e.target.value) })}>
                      {NUMS.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                  <label>
                    Ярусов
                    <select value={r.levels} onChange={(e) => updRack(i, k, { levels: Number(e.target.value) })}>
                      {NUMS.slice(0, 8).map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                  <label>
                    В ячейке
                    <select value={r.capacity || 1} onChange={(e) => updRack(i, k, { capacity: Number(e.target.value) })}>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} компл.</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="round sm"
                    aria-label="Удалить стеллаж"
                    disabled={used(w, r).length > 0}
                    title={used(w, r).length ? 'На стеллаже есть комплекты' : 'Удалить стеллаж'}
                    onClick={() => updWh(i, { racks: w.racks.filter((_, j) => j !== k) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => updWh(i, { racks: [...w.racks, newRack(w.racks)] })}>
                + Стеллаж
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setList((l) => [...l, { id: uid().slice(0, 8), name: `Контейнер ${l.length + 1}`, racks: [newRack([])] }])}>
          + Склад
        </button>
        {error && <div className="err">{error}</div>}
        <div className="buttons sticky">
          <span className="spacer" />
          <button type="button" onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  )
}
