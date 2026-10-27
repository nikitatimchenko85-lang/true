import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import qrcode from 'qrcode-generator'
import { formatPhone, humanDate } from '../lib.js'
import { SEASONS, formatNum, locationOf } from '../storage.js'

// Ссылка в QR открывает этот комплект в приложении
export const setLink = (s) => `${location.origin}${location.pathname}?s=${formatNum(s.num)}`

function Qr({ text }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true })
  }, [text])
  return <span className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
}

// Бирка 58×40 мм — под термопринтер этикеток; на A4 печатается сеткой
export function Label({ s, i, n, warehouses, company }) {
  const loc = locationOf(s, warehouses)
  const season = SEASONS[s.season]
  return (
    <div className="label">
      <div className="label-top">
        <span className="label-co">{company}</span>
        <span className={`label-season ${s.season}`}>{season?.label.toUpperCase()}</span>
      </div>
      <div className="label-mid">
        <div>
          <b className="label-num">{formatNum(s.num)}</b>
          <span className="label-loc">{loc.full}</span>
        </div>
        <Qr text={setLink(s)} />
      </div>
      <div className="label-car">{s.car}</div>
      <div className="label-row">
        <span>{[s.size, s.brand].filter(Boolean).join(' · ') || '—'}</span>
        {n > 1 && (
          <b>
            {i}/{n}
          </b>
        )}
      </div>
      <div className="label-row small">
        <span>{[s.client_name, s.phone && formatPhone(s.phone)].filter(Boolean).join(' · ')}</span>
        <span>{s.received_at && humanDate(s.received_at)}</span>
      </div>
    </div>
  )
}

// Предпросмотр и печать: по бирке на каждое колесо
export default function TireLabels({ s, warehouses, company }) {
  const [count, setCount] = useState(Number(s.qty) || 4)
  const [printing, setPrinting] = useState(false)
  const [paper, setPaper] = useState(() => {
    try {
      return localStorage.getItem('labels.paper') || 'roll'
    } catch {
      return 'roll'
    }
  })
  const pickPaper = (v) => {
    setPaper(v)
    try {
      localStorage.setItem('labels.paper', v)
    } catch {}
  }
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  const labels = Array.from({ length: count }, (_, k) => <Label key={k} s={s} i={k + 1} n={count} warehouses={warehouses} company={company} />)
  return (
    <div className="labels-box">
      <div className="label-preview">
        <Label s={s} i={1} n={count} warehouses={warehouses} company={company} />
      </div>
      <div className="buttons">
        <label className="label-count">
          Бирок
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="label-count">
          <select value={paper} onChange={(e) => pickPaper(e.target.value)}>
            <option value="roll">Принтер этикеток</option>
            <option value="a4">Лист A4</option>
          </select>
        </label>
        <button type="button" className="primary" onClick={() => setPrinting(true)}>
          Печать бирок
        </button>
      </div>
      <p className="muted small">Бирка 58×40 мм. Для принтера этикеток выберите в окне печати бумагу 58×40 и поля «нет»; на листе A4 бирки идут сеткой — вырезать по пунктиру.</p>
      {printing && createPortal(<div className={`print-labels ${paper}`}>{labels}</div>, document.body)}
    </div>
  )
}
