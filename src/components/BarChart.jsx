import { useState } from 'react'

// Столбики по дням: одна серия, без легенды (её называет заголовок), подсказка при наведении
export default function BarChart({ data, value, format, label, title }) {
  const [hover, setHover] = useState(null)
  const max = niceMax(Math.max(0, ...data.map(value)))
  const ticks = [0, max / 2, max].filter(Number.isInteger)
  const every = Math.ceil(data.length / 10) // подписей по оси X не больше десяти

  return (
    <figure className="chart" aria-label={title}>
      <div className="chart-plot">
        <div className="chart-y">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>
              {format(t, true)}
            </span>
          ))}
        </div>
        <div className="chart-area">
          {ticks.map((t) => (
            <i key={t} className="grid-line" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="bars" onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => {
              const v = value(d)
              return (
                <div
                  key={i}
                  className={`bar-slot ${hover === i ? 'on' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                >
                  <div className="bar" style={{ height: `${(v / max) * 100}%` }} />
                  {hover === i && (
                    <div className={`tip ${i > data.length / 2 ? 'left' : ''}`}>
                      <small>{label(d)}</small>
                      <b>{format(v)}</b>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="chart-x">
        {data.map((d, i) => (
          <span key={i}>{i % every === 0 ? label(d, true) : ''}</span>
        ))}
      </div>
    </figure>
  )
}

function niceMax(v) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p
  return 10 * p
}
