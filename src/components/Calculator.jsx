import { useState } from 'react'
import { CLASSES, RADIUSES, SERVICES, unitPrice } from '../prices.js'
import Modal from './Modal.jsx'

const rub = (n) => `${n.toLocaleString('ru-RU')} ₽`

// Справочный калькулятор шиномонтажа: с записью не связан, нужен, чтобы быстро назвать цену по телефону
export default function Calculator({ onClose }) {
  const [cls, setCls] = useState('')
  const [radius, setRadius] = useState('')
  const [lines, setLines] = useState([{ service: 0, qty: SERVICES[0].qty, own: '' }])

  const upd = (i, patch) => setLines((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const rows = lines.map((l) => {
    const s = SERVICES[l.service]
    const u = unitPrice(s, cls, radius)
    const price = l.own !== '' ? Number(l.own) : u.price
    return { ...l, s, u, sum: price != null ? price * (Number(l.qty) || 0) : null }
  })
  const total = rows.reduce((a, r) => a + (r.sum || 0), 0)
  const hasFrom = rows.some((r) => r.s.from && r.own === '')

  return (
    <Modal title="Калькулятор" onClose={onClose}>
      <div className="form">
        <div className="field">
          <span className="lbl">Класс</span>
          <div className="presets">
            {CLASSES.map((c) => (
              <button type="button" key={c} className={cls === c ? 'on' : ''} onClick={() => setCls(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Радиус</span>
          <div className="presets">
            {RADIUSES.map((r) => (
              <button type="button" key={r} className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="calc">
          {rows.map((r, i) => (
            <div className="calc-row" key={i}>
              <select
                value={r.service}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  upd(i, { service: n, qty: SERVICES[n].qty, own: '' })
                }}
              >
                {SERVICES.map((s, n) => (
                  <option key={s.name} value={n}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input type="number" min="0" value={r.qty} onChange={(e) => upd(i, { qty: e.target.value })} aria-label="Количество" />
              <input
                type="number"
                min="0"
                step="50"
                value={r.own}
                onChange={(e) => upd(i, { own: e.target.value })}
                placeholder={r.u.price != null ? `${r.s.from ? 'от ' : ''}${r.u.price}` : 'своя цена'}
                aria-label="Своя цена"
              />
              <span className="calc-sum">{r.sum != null ? rub(r.sum) : <span className="muted">{r.u.hint}</span>}</span>
              <button type="button" className="round sm" onClick={() => setLines((l) => l.filter((_, j) => j !== i))} aria-label="Убрать">
                ×
              </button>
            </div>
          ))}
        </div>
        {lines.length < 8 && (
          <button type="button" onClick={() => setLines((l) => [...l, { service: 1, qty: SERVICES[1].qty, own: '' }])}>
            + Услуга
          </button>
        )}

        <div className="calc-total">
          <span>Итого</span>
          <b>
            {hasFrom ? 'от ' : ''}
            {rub(total)}
          </b>
        </div>
        <p className="muted small">Количество, цена за единицу, своя цена — для услуг «от» и скидок. В запись цена не попадает.</p>
      </div>
    </Modal>
  )
}
