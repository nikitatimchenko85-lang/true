import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from './store.js'
import { addDays, dateKey, humanDate, isBlocking, parseDate, stamp, today, weekday } from './lib.js'
import Icon from './components/Icon.jsx'
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
  const onDay = (d) => {
    const from = stamp(d, 0)
    const to = stamp(addDays(d, 1), 0)
    return bookings.filter((b) => b.starts_at < to && b.ends_at > from && isBlocking(b))
  }
  const dayBookings = onDay(date)
  const inWork = dayBookings.filter((b) => b.status === 'in_progress').length
  const revenue = dayBookings
    .filter((b) => b.starts_at.slice(0, 10) === date)
    .reduce((sum, b) => sum + (Number(b.price) || 0), 0)

  const openNew = (preset = {}) =>
    setEditing({
      service_id: preset.service_id || visibleServices[0]?.id || activeServices[0]?.id,
      post: preset.post || 0,
      date: preset.date || date,
      min: preset.min ?? Math.max(settings.open_min, nextSlot(settings, date)),
    })

  const nav = [
    { key: 'today', icon: 'home', label: 'Сегодня', act: () => setDate(today()) },
    { key: 'grid', icon: 'grid', label: 'Сетка', on: view === 'grid', act: () => setView('grid') },
    { key: 'list', icon: 'list', label: 'Список', on: view === 'list', act: () => setView('list') },
    { key: 'search', icon: 'search', label: 'Поиск', act: () => setShowSearch(true) },
    { key: 'settings', icon: 'settings', label: 'Настройки', act: () => setShowSettings(true) },
  ]
  const name = me || (store.mode === 'supabase' ? session.user?.email?.split('@')[0] : '')

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="mark">{(settings.company || 'D')[0]}</span>
          {settings.company}
        </div>
        <nav className="iconnav">
          {nav.map((n) => (
            <button key={n.key} className={`round ${n.on ? 'on' : ''}`} onClick={n.act} title={n.label} aria-label={n.label}>
              <Icon name={n.icon} />
            </button>
          ))}
          {store.mode === 'supabase' && (
            <button className="round" onClick={() => store.signOut()} title={`Выйти (${session.user?.email})`} aria-label="Выйти">
              <Icon name="logout" />
            </button>
          )}
        </nav>
      </header>

      {store.mode === 'local' && (
        <div className="banner">
          Демо-режим: записи сохраняются только в этом браузере. Для общей базы подключите Supabase (см. README).
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      <section className="hero">
        <h1 className="greet">
          {greeting()},<br />
          {name || 'команда'}
        </h1>
        <button className="avatar" onClick={() => setShowSettings(true)} title="Ваше имя — в настройках">
          {(name || '?').slice(0, 1).toUpperCase()}
        </button>
      </section>

      <section className="tiles">
        <button className="tile lime cta" onClick={() => openNew()}>
          <span>
            <b>Записать клиента</b>
            <small>{inWork ? `Сейчас в работе: ${inWork}` : 'Выберите услугу и время'}</small>
          </span>
          <span className="go">
            <Icon name="arrow" />
          </span>
        </button>
        <div className="tile grey">
          <b>{dayBookings.length}</b>
          <small>{plural(dayBookings.length, 'запись', 'записи', 'записей')} на день</small>
        </div>
        <div className="tile black">
          <b>
            <span className="star">★</span> {revenue.toLocaleString('ru-RU')} ₽
          </b>
          <small>по записям дня</small>
        </div>
      </section>

      <section className="daybar">
        <h2>
          {weekday(date)}, {humanDate(date)}
        </h2>
        <div className="daynav">
          <button className="round sm" onClick={() => setDate(addDays(date, -1))} aria-label="Предыдущий день">
            <Icon name="left" />
          </button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Дата" />
          <button className="round sm" onClick={() => setDate(addDays(date, 1))} aria-label="Следующий день">
            <Icon name="right" />
          </button>
        </div>
      </section>

      <nav className="week">
        <button className="round sm" onClick={() => setDate(addDays(date, -7))} aria-label="Неделя назад">
          <Icon name="left" />
        </button>
        {days.map((d) => {
          const n = onDay(d).length
          return (
            <button
              key={d}
              className={`day ${d === date ? 'selected' : ''} ${d === today() ? 'today' : ''}`}
              onClick={() => setDate(d)}
            >
              <span className="wd">{weekday(d)}</span>
              <span className="dn">{parseDate(d).getDate()}</span>
              <span className="cnt">{n || ''}</span>
            </button>
          )
        })}
        <button className="round sm" onClick={() => setDate(addDays(date, 7))} aria-label="Неделя вперёд">
          <Icon name="right" />
        </button>
      </nav>

      <div className="chips">
        {activeServices.map((s) => (
          <button
            key={s.id}
            className={`chip ${hidden.has(s.id) ? 'off' : ''}`}
            style={{ '--c': s.color }}
            onClick={() => toggleService(s.id)}
          >
            <i />
            {s.name}
          </button>
        ))}
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

      <nav className="bottomnav">
        {nav.map((n) => (
          <button key={n.key} className={`round ${n.on ? 'on' : ''}`} onClick={n.act} aria-label={n.label}>
            <Icon name={n.icon} />
          </button>
        ))}
      </nav>

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

function greeting() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Доброе утро'
  if (h >= 12 && h < 17) return 'Добрый день'
  if (h >= 17 && h < 23) return 'Добрый вечер'
  return 'Доброй ночи'
}

function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

// Ближайший слот после текущего времени (для сегодняшнего дня)
function nextSlot(settings, date) {
  if (date !== dateKey(new Date())) return settings.open_min
  const now = new Date()
  const m = now.getHours() * 60 + now.getMinutes()
  const slot = Math.ceil(m / settings.step) * settings.step
  return Math.min(slot, settings.close_min - settings.step)
}
