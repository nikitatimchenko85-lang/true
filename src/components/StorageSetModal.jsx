import { useState } from 'react'
import { CellBusyError, store } from '../store.js'
import { RADII, addDays, formatPhone, humanDate, normalizePhone, phoneError, today } from '../lib.js'
import { rub } from '../prices.js'
import { haptic } from '../haptics.js'
import { SEASONS, firstFreeCell, formatNum, locationOf, overdue } from '../storage.js'
import Modal from './Modal.jsx'
import WarehouseMap from './WarehouseMap.jsx'
import TireLabels from './TireLabels.jsx'

const TERMS = [
  ['6 мес.', 182],
  ['до сезона', null],
  ['1 год', 365],
]
// До следующей смены сезона: летние лежат до мая, зимние — до октября
const seasonEnd = (season, from) => {
  const y = Number(from.slice(0, 4))
  const md = season === 'winter' ? '10-15' : '05-15'
  const d = `${y}-${md}`
  return d > from ? d : `${y + 1}-${md}`
}

// Осенью на хранение сдают летние, весной — зимние
const likelySeason = (day = today()) => {
  const m = Number(day.slice(5, 7))
  return m >= 8 || m <= 2 ? 'summer' : 'winter'
}

// Комплект на хранении. Новый — сразу форма приёма; существующий — сводка, из неё правка, перемещение, выдача, бирки
export default function StorageSetModal({ initial, config, user, sets, canEdit, onClose, onSaved, onAgain }) {
  const warehouses = config.warehouses
  const isNew = !initial.id
  const [mode, setMode] = useState(isNew ? 'form' : initial.mode || 'view') // view | form | pick | labels | issue
  const [f, setF] = useState(() => {
    if (!isNew) return { ...initial }
    const cell = initial.warehouse_id ? null : firstFreeCell(sets, warehouses, initial.prefer)
    const season = initial.season || likelySeason()
    return {
      season, qty: 4, rims: false, client_name: '', phone: '', car: '', brand: '', size: '', tread: '', comment: '', price: '',
      received_at: today(), status: 'stored', ...initial, ...(cell || {}),
      until: seasonEnd(season, today()),
    }
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const loc = f.warehouse_id ? locationOf(f, warehouses) : null
  const [mapWh, setMapWh] = useState(f.warehouse_id || warehouses[0]?.id)

  const persist = async (row, action, after = 'view') => {
    setBusy(true)
    setError('')
    try {
      const saved = await store.saveStorage(row, user.name, action, warehouses)
      haptic('success')
      setF(saved)
      onSaved(saved)
      setMode(after)
    } catch (err) {
      haptic('error')
      setError(err instanceof CellBusyError ? err.message : 'Ошибка: ' + err.message)
    }
    setBusy(false)
  }

  const save = (e) => {
    e.preventDefault()
    if (!f.car?.trim() && !f.client_name?.trim()) return setError('Укажите машину или клиента')
    if (phoneError(f.phone)) return setError('Телефон: ' + phoneError(f.phone).toLowerCase())
    if (!f.warehouse_id) return setError('Выберите ячейку на складе')
    const row = { ...f, car: f.car.trim(), client_name: f.client_name.trim(), qty: Number(f.qty) || 4, price: f.price === '' ? null : Number(f.price), created_by: f.created_by || user.name }
    // новый — сразу к биркам: их наклеивают при приёме
    persist(row, f.id ? 'storage_edit' : 'storage_in', f.id ? 'view' : 'labels')
  }

  const title = f.id ? `№ ${formatNum(f.num)}` : 'Приём на хранение'

  if (mode === 'pick')
    return (
      <Modal title="Выберите ячейку" onClose={() => setMode(f.id ? 'view' : 'form')} wide>
        <div className="form">
          {warehouses.length > 1 && (
            <div className="presets">
              {warehouses.map((w) => (
                <button type="button" key={w.id} className={mapWh === w.id ? 'on' : ''} onClick={() => setMapWh(w.id)}>
                  {w.name}
                </button>
              ))}
            </div>
          )}
          <WarehouseMap
            warehouse={warehouses.find((w) => w.id === mapWh) || warehouses[0]}
            sets={sets}
            selected={f}
            pick
            exceptId={f.id}
            onCell={(cell) => {
              if (!f.id || f.status === 'issued') return set(cell), setMode('form')
              persist({ ...f, ...cell }, 'storage_move')
            }}
          />
          {error && <div className="err">{error}</div>}
        </div>
      </Modal>
    )

  if (mode === 'form')
    return (
      <Modal title={title} onClose={f.id ? () => setMode('view') : onClose}>
        <form className="form storage-form" onSubmit={save}>
          <div className="presets season-pick">
            {Object.entries(SEASONS).map(([k, v]) => (
              <button
                type="button"
                key={k}
                className={f.season === k ? 'on' : ''}
                style={{ '--s': v.color }}
                onClick={() => set({ season: k, ...(f.id ? {} : { until: seasonEnd(k, f.received_at) }) })}
              >
                <i /> {v.label}
              </button>
            ))}
          </div>
          <div className="row2">
            <label>
              Машина, госномер
              <input value={f.car} onChange={(e) => set({ car: e.target.value })} placeholder="Kia Rio 123" autoComplete="off" />
            </label>
            <label>
              Клиент
              <input value={f.client_name} onChange={(e) => set({ client_name: e.target.value })} autoComplete="off" />
            </label>
          </div>
          <label>
            Телефон
            <input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} onBlur={() => f.phone && set({ phone: formatPhone(f.phone) })} placeholder="+7" />
          </label>
          <div className="row2">
            <label>
              Шины: марка, модель
              <input value={f.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Nokian Hakkapeliitta 10" />
            </label>
            <label>
              Размер
              <input value={f.size} onChange={(e) => set({ size: e.target.value })} placeholder="225/45 R17" list="tire-radii" />
              <datalist id="tire-radii">
                {RADII.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="row3">
            <label>
              Количество
              <select value={f.qty} onChange={(e) => set({ qty: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Протектор, мм
              <input value={f.tread} onChange={(e) => set({ tread: e.target.value })} inputMode="decimal" placeholder="6" />
            </label>
            <label className="check rims">
              <input type="checkbox" checked={!!f.rims} onChange={(e) => set({ rims: e.target.checked })} />
              на дисках
            </label>
          </div>
          <div className="field">
            <span className="lbl">Ячейка</span>
            <button type="button" className="cell-btn" onClick={() => setMode('pick')}>
              {loc ? <b>{loc.full}</b> : <b>Свободных ячеек нет</b>}
              <span>Выбрать на схеме</span>
            </button>
          </div>
          <div className="row2">
            <label>
              Хранить до
              <input type="date" value={f.until || ''} onChange={(e) => set({ until: e.target.value })} />
              <span className="presets">
                {TERMS.map(([name, days]) => (
                  <button type="button" key={name} onClick={() => set({ until: days ? addDays(f.received_at, days) : seasonEnd(f.season, f.received_at) })}>
                    {name}
                  </button>
                ))}
              </span>
            </label>
            <label>
              Стоимость, ₽
              <input value={f.price ?? ''} onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" />
              <span className="check">
                <input type="checkbox" checked={!!f.paid} onChange={(e) => set({ paid: e.target.checked })} /> оплачено
              </span>
            </label>
          </div>
          <label>
            Состояние, комментарий
            <textarea rows={2} value={f.comment || ''} onChange={(e) => set({ comment: e.target.value })} placeholder="Грыжа на одном колесе, без колпачков" />
          </label>
          {error && <div className="err">{error}</div>}
          <div className="buttons sticky">
            <span className="spacer" />
            <button type="button" onClick={f.id ? () => setMode('view') : onClose}>
              Отмена
            </button>
            <button className="primary" disabled={busy}>
              {f.id ? 'Сохранить' : 'Принять'}
            </button>
          </div>
        </form>
      </Modal>
    )

  const season = SEASONS[f.season]
  const issued = f.status === 'issued'
  const late = overdue(f)
  const rows = [
    ['Клиент', f.client_name],
    ['Телефон', f.phone && <a href={`tel:${normalizePhone(f.phone)}`}>{formatPhone(f.phone)}</a>],
    ['Шины', [f.brand, f.size].filter(Boolean).join(', ')],
    ['Количество', `${f.qty} шт.${f.rims ? ', на дисках' : ''}`],
    ['Протектор', f.tread && `${f.tread} мм`],
    ['Принято', [f.received_at && humanDate(f.received_at), f.created_by].filter(Boolean).join(' · ')],
    ['Хранить до', f.until && humanDate(f.until)],
    ['Стоимость', f.price != null && f.price !== '' && `${rub(f.price)}${f.paid ? ' · оплачено' : ' · не оплачено'}`],
    ['Выдано', issued && [f.issued_at && humanDate(f.issued_at), f.issued_by].filter(Boolean).join(' · ')],
    ['Комментарий', f.comment],
  ].filter(([, v]) => v)

  return (
    <Modal title={title} onClose={onClose}>
      <div className="form summary">
        <div className="summary-head" style={{ '--c': season?.color, '--s': issued ? '#9ca3af' : late ? '#dc2626' : season?.color }}>
          <b className="summary-car">{f.car || f.client_name}</b>
          <span className="summary-status">{issued ? 'Выдано' : late ? 'Срок хранения вышел' : `${season?.label} · на хранении`}</span>
          {!issued && (
            <span className="summary-where">
              <i /> {loc?.full}
            </span>
          )}
        </div>
        <dl className="summary-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {mode === 'labels' && <TireLabels s={f} warehouses={warehouses} company={config.company} />}
        {mode === 'issue' && (
          <div className="warn">
            Выдать {f.qty} шт. клиенту? Ячейка {loc?.cell} освободится.
            <div className="buttons">
              <button type="button" onClick={() => setMode('view')}>
                Нет
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => persist({ ...f, status: 'issued', issued_at: today(), issued_by: user.name }, 'storage_out')}>
                Выдать
              </button>
            </div>
          </div>
        )}
        {error && <div className="err">{error}</div>}
        {canEdit && mode !== 'issue' && (
          <div className="buttons wrap">
            {issued ? (
              <button type="button" className="primary" onClick={() => onAgain(f)}>
                Принять снова
              </button>
            ) : (
              <>
                {mode !== 'labels' && (
                  <button type="button" className="primary" onClick={() => setMode('labels')}>
                    Бирки
                  </button>
                )}
                <button type="button" onClick={() => setMode('issue')}>
                  Выдать
                </button>
                <button type="button" onClick={() => setMode('pick')}>
                  Переместить
                </button>
              </>
            )}
            <button type="button" onClick={() => setMode('form')}>
              Изменить
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
