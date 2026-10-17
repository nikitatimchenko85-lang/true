import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from './store.js'
import { addDays, dateKey, humanDate, parseDate, stamp, today, weekday } from './lib.js'
import Login from './components/Login.jsx'
import DayGrid from './components/DayGrid.jsx'
import DayList from './components/DayList.jsx'
import BookingModal from './components/BookingModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import SearchModal from './components/SearchModal.jsx'

const pref = (k, fallback) => {
  try {
    return localStorage.getItem(k) ?? fallback
  } catch {
    return fallback
  }
}
const setPref = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}

const weekStart = (key) => {
  const d = parseDate(key).getDay()
  return addDays(key, -((d + 6) % 7))
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    store.getSession().then(setSession)
    return store.onAuthChange(setSession)
  }, [])

  if (session === undefined) return <div className="center muted">Загрузка…</div>
  if (!session) return <Login />
  return <Main session={session} />
}

function Main({ session }) {
  const [date, setDate] = useState(today())
  const [services, setServices] = useState([])
  const [settings, setSettings] = useState(null)
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const [view, setView] = useState(() => pref('view', window.innerWidth < 700 ? 'list' : 'grid'))
  const [hidden, setHidden] = useState(() => new Set(JSON.parse(pref('hiddenServices', '[]'))))
  const [editing, setEditing] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [me, setMe] = useState(() => pref('employee', ''))

  const week = weekStart(date)
  const range = useMemo(() => {
    // неделя + запас, чтобы видеть многодневные работы
    return { from: stamp(addDays(week, -7), 0), to: stamp(addDays(week, 8), 0) }
  }, [week, date])

  const load = useCallback(async () => {
    try {
      const [sv, st, bk] = await Promise.all([
        store.listServices(),
        store.getSettings(),
        store.listBookings(range.from, range.to),
      ])
      setServices(sv)
      setSettings(st)
      setBookings(bk)
      setError('')
    } catch (e) {
      setError('Не удалось загрузить данные: ' + (e.message || e))
    }
  }, [range])

  useEffect(() => {
    load()
    return store.subscribe(load)
  }, [load])

  useEffect(() => setPref('view', view), [view])
  useEffect(() => setPref('hiddenServices', JSON.stringify([...hidden])), [hidden])

  const activeServices = services.filter((s) => s.active !== false).sort((a, b) => a.sort - b.sort)
  const visibleServices = activeServices.filter((s) => !hidden.has(s.id))
  const employee = me || (store.mode === 'supabase' ? session.user?.email : '')

  const toggleService = (id) =>
    setHidden((h) => {
      const n = new Set(h)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  if (!settings) return <div className="center muted">{error || 'Загрузка…'}</div>

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const countFor = (d) => {
    const from = stamp(d, 0)
    const to = stamp(addDays(d, 1), 0)
    return bookings.filter((b) => b.starts_at < to && b.ends_at > from && b.status !== 'cancelled').length
  }

  const openNew = (preset = {}) =>
    setEditing({
      service_id: preset.service_id || visibleServices[0]?.id || activeServices[0]?.id,
      post: preset.post || 0,
      date: preset.date || date,
      min: preset.min ?? Math.max(settings.open_min, nextSlot(settings, date)),
    })

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">{settings.company}</div>
        <div className="datenav">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Предыдущий день">‹</button>
          <button className={date === today() ? 'active' : ''} onClick={() => setDate(today())}>
            Сегодня
          </button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Следующий день">›</button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="actions">
          <button onClick={() => setShowSearch(true)} title="Поиск клиента">🔍 Поиск</button>
          <button onClick={() => setShowSettings(true)} title="Настройки">⚙️</button>
          {store.mode === 'supabase' && (
            <button onClick={() => store.signOut()} title={session.user?.email}>
              Выйти
            </button>
          )}
        </div>
      </header>

      {store.mode === 'local' && (
        <div className="banner">
          Демо-режим: записи сохраняются только в этом браузере. Чтобы у всех сотрудников была общая база,
          подключите Supabase (см. README).
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      <nav className="week">
        <button className="weekarrow" onClick={() => setDate(addDays(date, -7))} aria-label="Неделя назад">
          «
        </button>
        {days.map((d) => {
          const n = countFor(d)
          return (
            <button
              key={d}
              className={`day ${d === date ? 'selected' : ''} ${d === today() ? 'today' : ''}`}
              onClick={() => setDate(d)}
            >
              <span className="wd">{weekday(d)}</span>
              <span className="dn">{parseDate(d).getDate()}</span>
              <span className="cnt">{n ? n : ''}</span>
            </button>
          )
        })}
        <button className="weekarrow" onClick={() => setDate(addDays(date, 7))} aria-label="Неделя вперёд">
          »
        </button>
      </nav>

      <div className="toolbar">
        <h1>
          {weekday(date)}, {humanDate(date)}
        </h1>
        <div className="chips">
          {activeServices.map((s) => (
            <button
              key={s.id}
              className={`chip ${hidden.has(s.id) ? 'off' : ''}`}
              style={{ '--c': s.color }}
              onClick={() => toggleService(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>
            Сетка
          </button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            Список
          </button>
        </div>
        <button className="primary" onClick={() => openNew()}>
          + Записать
        </button>
      </div>

      <main>
        {view === 'grid' ? (
          <DayGrid
            date={date}
            services={visibleServices}
            bookings={bookings}
            settings={settings}
            onCreate={openNew}
            onOpen={(b) => setEditing(b)}
          />
        ) : (
          <DayList
            date={date}
            services={visibleServices}
            allServices={services}
            bookings={bookings}
            settings={settings}
            onOpen={(b) => setEditing(b)}
            onCreate={openNew}
          />
        )}
      </main>

      {editing && (
        <BookingModal
          initial={editing}
          services={activeServices}
          allServices={services}
          settings={settings}
          bookings={bookings}
          employee={employee}
          onClose={() => setEditing(null)}
          onSaved={(b) => {
            setEditing(null)
            setDate(b.starts_at.slice(0, 10))
            load()
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          services={services}
          settings={settings}
          me={me}
          onMe={(v) => {
            setMe(v)
            setPref('employee', v)
          }}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false)
            load()
          }}
        />
      )}
      {showSearch && (
        <SearchModal
          services={services}
          onClose={() => setShowSearch(false)}
          onPick={(b) => {
            setShowSearch(false)
            setDate(b.starts_at.slice(0, 10))
            setEditing(b)
          }}
        />
      )}
    </div>
  )
}

// Ближайший слот после текущего времени (для сегодняшнего дня)
function nextSlot(settings, date) {
  if (date !== dateKey(new Date())) return settings.open_min
  const now = new Date()
  const m = now.getHours() * 60 + now.getMinutes()
  const slot = Math.ceil(m / settings.step) * settings.step
  return Math.min(slot, settings.close_min - settings.step)
}
