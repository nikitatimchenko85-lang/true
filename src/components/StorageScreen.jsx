import { useMemo, useState } from 'react'
import { humanDate, plural } from '../lib.js'
import { SEASONS, formatNum, isStored, locationOf, overdue, searchSets, warehouseStats } from '../storage.js'
import Icon from './Icon.jsx'
import WarehouseMap from './WarehouseMap.jsx'

// Раздел «Хранение шин»: склады-контейнеры со схемой ячеек, поиск и список комплектов
export default function StorageScreen({ config, sets, canEdit, canSetup, whId, setWhId, onOpen, onNew, onSetup }) {
  const warehouses = config.warehouses
  const wh = warehouses.find((w) => w.id === whId) || warehouses[0]
  const [view, setView] = useState('map') // map | list
  const [filter, setFilter] = useState('stored') // stored | overdue | issued
  const [q, setQ] = useState('')

  const stored = sets.filter(isStored)
  const found = useMemo(() => searchSets(sets, q), [sets, q])
  const match = q.trim() ? new Set(found.map((s) => s.id)) : null
  const stats = warehouses.map((w) => ({ w, ...warehouseStats(w, sets) }))
  const total = stats.reduce((n, x) => n + x.total, 0)
  const late = stored.filter((s) => overdue(s))
  const listed = (q.trim() ? found : sets)
    .filter((s) => (filter === 'issued' ? !isStored(s) : filter === 'overdue' ? overdue(s) : isStored(s)))
    .sort((a, b) => b.num - a.num)

  return (
    <div className="storage">
      <section className="tiles">
        {canEdit ? (
          <button className="tile accent cta" onClick={() => onNew({ prefer: wh?.id })}>
            <span>
              <b>Принять</b>
              <small>шины на хранение</small>
            </span>
            <span className="go">
              <Icon name="plus" />
            </span>
          </button>
        ) : (
          <div className="tile accent">
            <b>Хранение</b>
            <small>просмотр</small>
          </div>
        )}
        <div className="tile grey">
          <b>{stored.length}</b>
          <small>
            {plural(stored.length, 'комплект', 'комплекта', 'комплектов')} · зима {stored.filter((s) => s.season === 'winter').length}, лето{' '}
            {stored.filter((s) => s.season === 'summer').length}
          </small>
        </div>
        <button className="tile black" onClick={() => (setView('list'), setFilter(late.length ? 'overdue' : 'stored'))}>
          <b>
            <span className="accent-text">{total - stored.length}</span> / {total}
          </b>
          <small>{late.length ? `мест свободно · срок вышел: ${late.length}` : 'мест свободно'}</small>
        </button>
      </section>

      <nav className="tabs">
        {stats.map(({ w, used, total }) => (
          <button key={w.id} className={wh?.id === w.id ? 'on' : ''} onClick={() => (setWhId(w.id), setView('map'))}>
            {w.name}
            <small className="tab-count">
              {used}/{total}
            </small>
          </button>
        ))}
        {canSetup && (
          <button onClick={onSetup}>
            <Icon name="settings" size={16} /> Склады
          </button>
        )}
      </nav>

      <section className="storage-bar">
        <input type="search" placeholder="Номер, машина, клиент, телефон" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="presets">
          <button type="button" className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>
            Схема
          </button>
          <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            Список
          </button>
        </div>
      </section>

      {view === 'map' ? (
        wh ? (
          <>
            {match && (
              <p className="muted small">
                Найдено: {found.filter(isStored).length}. Подходящие ячейки подсвечены{found.some((s) => !isStored(s)) ? ', выданные — в списке' : ''}.
              </p>
            )}
            <div className="season-legend">
              {Object.values(SEASONS).map((s) => (
                <span key={s.label} style={{ '--s': s.color }}>
                  <i>{s.short}</i> {s.label}
                </span>
              ))}
              <span className="muted">Верхний ярус — сверху. Нажмите на ячейку, чтобы открыть комплект или принять в неё новый.</span>
            </div>
            <WarehouseMap
              warehouse={wh}
              sets={sets}
              match={match}
              onCell={(cell, here) => {
                if (here.length === 1) return onOpen(here[0])
                if (here.length > 1) return onOpen(here.find((s) => match?.has(s.id)) || here[0])
                if (canEdit) onNew(cell)
              }}
            />
          </>
        ) : (
          <p className="muted">Складов пока нет. {canSetup ? 'Добавьте контейнер в «Складах».' : ''}</p>
        )
      ) : (
        <>
          <div className="presets">
            {[
              ['stored', 'На хранении'],
              ['overdue', `Срок вышел${late.length ? ` (${late.length})` : ''}`],
              ['issued', 'Выданные'],
            ].map(([k, name]) => (
              <button type="button" key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                {name}
              </button>
            ))}
          </div>
          {!listed.length ? (
            <p className="muted">Ничего не найдено.</p>
          ) : (
            <ul className="set-list">
              {listed.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpen(s)} style={{ '--s': SEASONS[s.season]?.color }}>
                    <span className="set-num">
                      <i>{SEASONS[s.season]?.short}</i>
                      {formatNum(s.num)}
                    </span>
                    <span className="set-main">
                      <b>{s.car || s.client_name}</b>
                      <small>{[s.client_name !== s.car && s.client_name, s.size, s.brand].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="set-loc">
                      {isStored(s) ? locationOf(s, warehouses).full : `выдано ${s.issued_at ? humanDate(s.issued_at) : ''}`}
                      {s.until && isStored(s) && <small className={overdue(s) ? 'late' : ''}>до {humanDate(s.until)}</small>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
