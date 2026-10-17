import { useState } from 'react'
import { RADII } from '../lib.js'
import { PRICE_CLASSES, lineFromItem, lineSum, linesTotal, repriceLines, rub, unitPrice } from '../prices.js'
import Modal from './Modal.jsx'

// Калькулятор по прайс-листам: быстро назвать цену по телефону и сразу записать с этим расчётом
export default function Calculator({ depts, pricelists, onClose, onBook }) {
  const withList = depts.filter((d) => pricelists[d.id]?.length)
  const [deptId, setDeptId] = useState(withList[0]?.id)
  const [cls, setCls] = useState('')
  const [radius, setRadius] = useState('')
  const [lines, setLines] = useState([])

  const list = pricelists[deptId] || []
  const needsClass = list.some((i) => i.kind === 'class_radius')
  const needsRadius = needsClass || list.some((i) => i.kind === 'radius')
  const has = (id) => lines.some((l) => l.item_id === id)
  const toggle = (item) => setLines((ls) => (has(item.id) ? ls.filter((l) => l.item_id !== item.id) : [...ls, lineFromItem(item, cls, radius)]))
  const size = (c, r) => {
    setCls(c)
    setRadius(r)
    setLines((ls) => repriceLines(ls, list, c, r))
  }
  const upd = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const total = linesTotal(lines)
  const hasFrom = lines.some((l) => l.from && !l.own)

  if (!withList.length)
    return (
      <Modal title="Калькулятор" onClose={onClose}>
        <p className="muted">Прайс-листы пустые. Заполните их в Настройках → Прайс-листы.</p>
      </Modal>
    )

  return (
    <Modal title="Калькулятор" onClose={onClose}>
      <div className="form">
        {withList.length > 1 && (
          <div className="presets depts">
            {withList.map((d) => (
              <button
                type="button"
                key={d.id}
                className={deptId === d.id ? 'on' : ''}
                style={{ '--c': d.color }}
                onClick={() => {
                  setDeptId(d.id)
                  setLines([])
                }}
              >
                <i /> {d.name}
              </button>
            ))}
          </div>
        )}
        {needsClass && (
          <div className="field">
            <span className="lbl">Класс</span>
            <div className="presets">
              {PRICE_CLASSES.map((c) => (
                <button type="button" key={c} className={cls === c ? 'on' : ''} onClick={() => size(c, radius)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {needsRadius && (
          <div className="field">
            <span className="lbl">Радиус</span>
            <div className="presets">
              {RADII.map((r) => (
                <button type="button" key={r} className={radius === r ? 'on' : ''} onClick={() => size(cls, r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <span className="lbl">Услуги</span>
          <div className="presets">
            {list.map((i) => {
              const u = unitPrice(i, cls, radius)
              return (
                <button type="button" key={i.id} className={has(i.id) ? 'on' : ''} onClick={() => toggle(i)}>
                  {i.name}
                  {u.price != null && <small> · {i.from ? 'от ' : ''}{u.price}</small>}
                </button>
              )
            })}
          </div>
        </div>

        {lines.length > 0 && (
          <div className="lines">
            {lines.map((l, i) => {
              const item = list.find((x) => x.id === l.item_id)
              return (
                <div className="line-row" key={l.item_id}>
                  <span className="line-name">
                    {l.name}
                    {l.price == null && item && <small className="muted"> · {unitPrice(item, cls, radius).hint}</small>}
                  </span>
                  <input type="number" min="0" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} aria-label="Количество" />
                  <input
                    type="number"
                    step="50"
                    value={l.price ?? ''}
                    onChange={(e) => upd(i, { price: e.target.value === '' ? null : e.target.value, own: true })}
                    placeholder="цена"
                    aria-label="Цена за единицу"
                  />
                  <span className="line-sum">{l.price != null ? rub(lineSum(l)) : '—'}</span>
                  <button type="button" className="round sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Убрать">
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="calc-total">
          <span>Итого</span>
          <b>
            {hasFrom ? 'от ' : ''}
            {rub(total)}
          </b>
        </div>
        {onBook && (
          <button
            type="button"
            className="primary big"
            disabled={!lines.length}
            onClick={() => onBook({ service_id: deptId, tire_class: cls, radius, items: lines })}
          >
            Записать с этим расчётом
          </button>
        )}
      </div>
    </Modal>
  )
}
