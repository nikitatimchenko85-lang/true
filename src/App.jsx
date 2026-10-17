import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConflictError, store } from './store.js'
import {
  addDays, computeEnd, dateKey, findConflict, humanDate, humanStamp, isBlocking, parseDate, stamp, today,
  unionView, weekday, workMinutes,
} from './lib.js'
import Icon from './components/Icon.jsx'
import Login from './components/Login.jsx'
import WhoAmI from './components/WhoAmI.jsx'
import DayGrid from './components/DayGrid.jsx'
import DayList from './components/DayList.jsx'
import BookingModal from './components/BookingModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import SearchModal from './components/SearchModal.jsx'
import Calculator from './components/Calculator.jsx'

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
  // Дата у каждого своя: листание дней не мешает другим администраторам
  const [date, setDate] = useState(today())
  const [config, setConfig] = useState(null)
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [view, setView] = useState(() => pref('view', 'grid'))
  const [deptId, setDeptId] = useState(() => pref('dept', 'tires'))
  const [editing, setEditing] = useState(null)
  const [panel, setPanel] = useState(null) // settings | search | calc
  const [me, setMe] = useState(() => pref('employee', ''))

  const week = weekStart(date)
  // неделя + запас, чтобы видеть многодневные работы
  const range = useMemo(() => ({ from: stamp(addDays(week, -7), 0), to: stamp(addDays(week, 8), 0) }), [week])

  const load = useCallback(async () => {
    try {
      const [cfg, bk] = await Promise.all([store.getConfig(), store.listBookings(range.from, range.to)])
      setConfig(cfg)
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
  useEffect(() => setPref('dept', deptId), [deptId])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  if (!config) return <div className="center muted">{error || 'Загрузка…'}</div>

  const saveMe = (v) => {
    setMe(v)
    setPref('employee', v)
  }
  if (!me) return <WhoAmI admins={config.admins} onPick={saveMe} />

  const allDepts = config.departments
  const active = allDepts.filter((d) => d.active !== false)
  const shown = deptId === 'all' ? active : active.filter((d) => d.id === deptId)
  const depts = shown.length ? shown : active.slice(0, 1)
  const gridView = depts.length === 1 ? depts[0] : unionView(depts)
  const deptIds = new Set(depts.map((d) => d.id))

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const onDay = (d) => {
    const from = stamp(d, 0)
    const to = stamp(addDays(d, 1), 0)
    return bookings.filter((b) => deptIds.has(b.service_id) && b.starts_at < to && b.ends_at > from)
  }
  const dayBookings = onDay(date)
  const live = dayBookings.filter(isBlocking)
  const noShow = dayBookings.filter((b) => b.status === 'no_show').length
  const totalPosts = depts.reduce((n, d) => n + d.posts.length, 0)
  const now = new Date()
  const nowStamp = stamp(today(), now.getHours() * 60 + now.getMinutes())
  const busyNow = live.filter((b) => b.starts_at <= nowStamp && b.ends_at > nowStamp).length

  const openNew = (preset = {}) => {
    const d = allDepts.find((x) => x.id === preset.service_id) || depts[0]
    setEditing({
      ...preset,
      service_id: d.id,
      post: preset.post || 0,
      date: preset.date || date,
      min: preset.min ?? nextSlot(d, preset.date || date),
    })
  }

  // Перетаскивание: та же длительность, новое время/пост
  const move = async (b, to) => {
    const d = allDepts.find((x) => x.id === b.service_id)
    const starts_at = stamp(to.date, to.min)
    const moved = { ...b, post: to.post, starts_at, ends_at: computeEnd(starts_at, workMinutes(b.starts_at, b.ends_at, d), d) }
    const c = findConflict(bookings, moved)
    if (c) return setToast(`Не перенесено: пост занят (${c.car}, ${humanStamp(c.starts_at)})`)
    setBookings((list) => list.map((x) => (x.id === b.id ? moved : x)))
    try {
      await store.saveBooking(moved)
      setToast(`${b.car} → ${d.posts[to.post - 1].name}, ${humanStamp(starts_at)}`)
    } catch (e) {
      setToast(e instanceof ConflictError ? 'Не перенесено: пост уже заняли' : 'Ошибка: ' + e.message)
    }
    load()
  }

  const nav = [
    { key: 'today', icon: 'home', label: 'Сегодня', act: () => setDate(today()), desktop: true },
    { key: 'grid', icon: 'grid', label: 'Сетка', on: view === 'grid', act: () => setView('grid') },
    { key: 'list', icon: 'list', label: 'Список', on: view === 'list', act: () => setView('list') },
    { key: 'search', icon: 'search', label: 'Поиск', act: () => setPanel('search') },
    { key: 'calc', icon: 'calc', label: 'Калькулятор цен', act: () => setPanel('calc') },
    { key: 'settings', icon: 'settings', label: 'Настройки', act: () => setPanel('settings') },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <img className="logo" src="logo.png" alt={config.company} />
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
        <div className="banner">Демо-режим: записи видны только в этом браузере. Для общей базы подключите Supabase (см. README).</div>
      )}
      {error && <div className="banner error">{error}</div>}

      <section className="hero">
        <h1 className="greet">
          {greeting()},<br />
          {me}
        </h1>
        <button className="avatar" onClick={() => setPanel('settings')} title="Сменить администратора">
          {me.slice(0, 1).toUpperCase()}
        </button>
      </section>

      <section className="tiles">
        <button className="tile accent cta" onClick={() => openNew()}>
          <span>
            <b>Записать</b>
            <small>{depts.length === 1 ? depts[0].name : 'в любое подразделение'}</small>
          </span>
          <span className="go">
            <Icon name="plus" />
          </span>
        </button>
        <div className="tile grey">
          <b>{live.length}</b>
          <small>
            {plural(live.length, 'запись', 'записи', 'записей')}
            {noShow ? ` · не приехали: ${noShow}` : ''}
          </small>
        </div>
        <div className="tile black">
          {date === today() ? (
            <>
              <b>
                <span className="accent-text">{totalPosts - busyNow}</span> / {totalPosts}
              </b>
              <small>постов свободно сейчас</small>
            </>
          ) : (
            <>
              <b>{totalPosts}</b>
              <small>{plural(totalPosts, 'пост', 'поста', 'постов')}</small>
            </>
          )}
        </div>
      </section>

      <nav className="tabs">
        {active.length > 1 && (
          <button className={deptId === 'all' ? 'on' : ''} onClick={() => setDeptId('all')}>
            Все
          </button>
        )}
        {active.map((d) => (
          <button
            key={d.id}
            className={deptId !== 'all' && depts[0].id === d.id ? 'on' : ''}
            style={{ '--c': d.color }}
            onClick={() => setDeptId(d.id)}
          >
            <i />
            {d.name}
          </button>
        ))}
      </nav>

      <section className="daybar">
        <h2>
          {weekday(date)}, {humanDate(date)}
        </h2>
        <div className="daynav">
          {date !== today() && (
            <button className="today-btn" onClick={() => setDate(today())}>
              Сегодня
            </button>
          )}
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
          const n = onDay(d).filter(isBlocking).length
          return (
            <button key={d} className={`day ${d === date ? 'selected' : ''} ${d === today() ? 'today' : ''}`} onClick={() => setDate(d)}>
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

      <main>
        {view === 'grid' ? (
          <DayGrid
            date={date}
            depts={depts}
            bookings={bookings}
            view={gridView}
            onCreate={openNew}
            onOpen={(b) => setEditing(b)}
            onMove={move}
            canMove={isBlocking}
          />
        ) : (
          <DayList date={date} depts={depts} bookings={bookings} view={gridView} onOpen={(b) => setEditing(b)} onCreate={openNew} />
        )}
      </main>

      <nav className="bottomnav">
        {nav
          .filter((n) => !n.desktop)
          .map((n) => (
            <button key={n.key} className={`round ${n.on ? 'on' : ''}`} onClick={n.act} aria-label={n.label}>
              <Icon name={n.icon} />
            </button>
          ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}

      {editing && (
        <BookingModal
          key={editing.id || `${editing.service_id}-${editing.date}-${editing.min}`}
          initial={editing}
          depts={active}
          allDepts={allDepts}
          bookings={bookings}
          employee={me}
          onClose={() => setEditing(null)}
          onSaved={(b) => {
            setEditing(null)
            setDate(b.starts_at.slice(0, 10))
            load()
          }}
          onChain={openNew}
        />
      )}
      {panel === 'settings' && (
        <SettingsModal
          config={config}
          me={me}
          onMe={saveMe}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null)
            load()
          }}
        />
      )}
      {panel === 'search' && (
        <SearchModal
          depts={allDepts}
          onClose={() => setPanel(null)}
          onPick={(b) => {
            setPanel(null)
            setDate(b.starts_at.slice(0, 10))
            setEditing(b)
          }}
        />
      )}
      {panel === 'calc' && <Calculator onClose={() => setPanel(null)} />}
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
function nextSlot(dept, date) {
  if (date !== dateKey(new Date())) return dept.open_min
  const now = new Date()
  const m = now.getHours() * 60 + now.getMinutes()
  const slot = Math.ceil(m / dept.step) * dept.step
  return Math.max(dept.open_min, Math.min(slot, dept.close_min - dept.step))
}
