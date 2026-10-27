import { SEASONS, cellName, formatNum, occupancy } from '../storage.js'

// Схема склада: каждый стеллаж — сетка секций (слева направо) и ярусов (верхний ярус сверху).
// В режиме выбора (pick) занятые ячейки неактивны, выбранная подсвечена.
export default function WarehouseMap({ warehouse, sets, match, selected, pick, exceptId, onCell }) {
  const occ = occupancy(sets.filter((s) => s.id !== exceptId))
  return (
    <div className="wh-map">
      {warehouse.racks.map((r) => (
        <section key={r.id} className="rack">
          <h4>
            Стеллаж {r.name}
            <small>
              {r.sections} × {r.levels}
              {r.capacity > 1 ? ` · по ${r.capacity} компл.` : ''}
            </small>
          </h4>
          <div className="rack-grid" style={{ '--cols': r.sections }}>
            {Array.from({ length: r.levels }, (_, i) => r.levels - i).map((level) =>
              Array.from({ length: r.sections }, (_, j) => j + 1).map((section) => {
                const here = occ[`${warehouse.id}:${r.id}:${section}:${level}`] || []
                const full = here.length >= (r.capacity || 1)
                const isSel = selected && selected.warehouse_id === warehouse.id && selected.rack_id === r.id && selected.section === section && selected.level === level
                const dim = match && here.length > 0 && !here.some((s) => match.has(s.id))
                const hit = match && here.some((s) => match.has(s.id))
                return (
                  <button
                    type="button"
                    key={`${level}-${section}`}
                    className={`cell ${here.length ? 'busy' : 'free'} ${isSel ? 'sel' : ''} ${dim ? 'dim' : ''} ${hit ? 'hit' : ''}`}
                    disabled={pick && full && !isSel}
                    title={here.length ? here.map((s) => `№ ${formatNum(s.num)} ${s.car}`).join('\n') : `Свободно: ${cellName(r, section, level)}`}
                    onClick={() => onCell({ warehouse_id: warehouse.id, rack_id: r.id, section, level }, here)}
                  >
                    <span className="cell-name">{cellName(r, section, level)}</span>
                    {here.map((s) => (
                      <span key={s.id} className="cell-set" style={{ '--s': SEASONS[s.season]?.color }}>
                        <i>{SEASONS[s.season]?.short}</i>
                        <b>{formatNum(s.num)}</b>
                        <small>{s.car}</small>
                      </span>
                    ))}
                    {!here.length && !pick && <span className="cell-plus">+</span>}
                  </button>
                )
              }),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}
