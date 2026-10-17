import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConflictError, store } from './store.js'
import {
  addDays, computeEnd, dateKey, findConflict, humanDate, humanStamp, isBlocking, nextFreeSlots, parseDate, plural, stamp,
  nowSlot, splitStamp, today, unionView, weekday, workMinutes,
} from './lib.js'
import { ROLES, can, deptAllowed, effectiveUser } from './access.js'
import { haptic } from './haptics.js'
import Icon from './components/Icon.jsx'
import Login from './components/Login.jsx'
import PinLogin from './components/PinLogin.jsx'
import DayGrid from './components/DayGrid.jsx'
import DayList from './components/DayList.jsx'
import BookingModal from './components/BookingModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import SearchModal from './components/SearchModal.jsx'
import Calculator from './components/Calculator.jsx'
import ReportsModal from './components/ReportsModal.jsx'

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
  const [panel, setPanel] = useState(null) // settings | search | calc | reports
  // Кто работает: вход по PIN, экран блокируется после простоя
  const [userId, setUserId] = useState(() => pref('pin.user', ''))
  const [unlocked, setUnlocked] = useState(() => Date.now() < Number(pref('pin.until', 0)))

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
  const lockMin = config?.lock_min ?? 30
  useEffect(() => {
    if (!unlocked) return
    let last = 0
    const touch = () => {
      if (Date.now() - last < 15_000) return
      last = Date.now()
      setPref('pin.until', lockMin ? Date.now() + lockMin * 60_000 : 8.64e15)
    }
    touch()
    const check = setInterval(() => Date.now() > Number(pref('pin.until', 0)) && setUnlocked(false), 15_000)
    window.addEventListener('pointerdown', touch)
    window.addEventListener('keydown', touch)
    return () => {
      clearInterval(check)
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
    }
  }, [unlocked, lockMin])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  if (!config) return <div className="center muted">{error || 'Загрузка…'}</div>

  const user = unlocked && effectiveUser(config, config.users.find((u) => u.id === userId))
  if (!user) {
    return (
      <PinLogin
        users={config.users}
        lastId={userId}
        onLogin={(u) => {
          setUserId(u.id)
          setPref('pin.user', u.id)
          setPref('pin.until', Date.now() + 60_000)
          setUnlocked(true)
        }}
        onSetPin={async (u, pin) => {
          const fresh = await store.getConfig()
          await store.saveConfig({ ...fresh, users: fresh.users.map((x) => (x.id === u.id ? { ...x, pin } : x)) })
          await load()
        }}
      />
    )
  }
  const lock = () => {
    setPref('pin.until', 0)
    setUnlocked(false)
    setPanel(null)
    setEditing(null)
  }
  const canBook = can(user, 'book')
  const canSettings = ['settings', 'users', 'pricelists'].some((p) => can(user, p))
  const canReports = can(user, 'reports') || can(user, 'export')

  const allDepts = config.departments
  const active = allDepts.filter((d) => d.active !== false && deptAllowed(user, d.id))
  if (!active.length)
    return (
      <div className="center">
        <div className="login">
          <p>У вас нет доступа ни к одному подразделению. Обратитесь к руководителю.</p>
          <button onClick={lock}>Сменить пользователя</button>
        </div>
      </div>
    )
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

  // Без выбранного места — сразу ближайшее свободное окно
  const openNew = (preset = {}) => {
    if (!canBook) return
    const d = active.find((x) => x.id === preset.service_id) || depts[0]
    const day = preset.date || date
    let { post = 0, min } = preset
    let slotDay = day
    if (min == null) {
      const from = stamp(day, day === today() ? nextSlot(d, day) : 0)
      const slot = nextFreeSlots(bookings, d, from, { count: 1 })[0]
      if (slot) {
        ;({ date: slotDay, min } = splitStamp(slot.starts_at))
        post = slot.post
      } else min = nextSlot(d, day)
    }
    setEditing({ ...preset, service_id: d.id, post, date: slotDay, min })
  }

  // Перетаскивание: та же длительность, новое время/пост
  const move = async (b, to) => {
    const d = allDepts.find((x) => x.id === b.service_id)
    const starts_at = stamp(to.date, to.min)
    if (starts_at < nowSlot(d.step)) return haptic('error'), setToast('Не перенесено: это время уже прошло')
    const moved = { ...b, post: to.post, starts_at, ends_at: computeEnd(starts_at, workMinutes(b.starts_at, b.ends_at, d), d) }
    const c = findConflict(bookings, moved)
    if (c) return haptic('error'), setToast(`Не перенесено: пост занят (${c.car}, ${humanStamp(c.starts_at)})`)
    setBookings((list) => list.map((x) => (x.id === b.id ? moved : x)))
    try {
      await store.saveBooking(moved)
      haptic('success')
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
    canReports && { key: 'reports', icon: 'chart', label: 'Отчёты и выгрузки', act: () => setPanel('reports') },
    canSettings && { key: 'settings', icon: 'settings', label: 'Настройки', act: () => setPanel('settings') },
  ].filter(Boolean)

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
          <button className="round" onClick={lock} title={`Заблокировать (${user.name})`} aria-label="Заблокировать">
            <Icon name="lock" />
          </button>
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
        <h1 className="greet" style={{ '--len': Math.max(greeting().length + 1, user.name.length) }}>
          {greeting()},<br />
          {user.name}
        </h1>
        <button className="avatar" onClick={lock} title={`${ROLES[user.role]?.label}. Нажмите, чтобы сменить пользователя`}>
          {user.name.slice(0, 1).toUpperCase()}
        </button>
      </section>

      <section className="tiles">
        {canBook ? (
          <button className="tile accent cta" onClick={() => openNew()}>
            <span>
              <b>Записать</b>
              <small>{depts.length === 1 ? `${depts[0].name} · ближайшее свободное время` : 'в любое подразделение'}</small>
            </span>
            <span className="go">
              <Icon name="plus" />
            </span>
          </button>
        ) : (
          <div className="tile accent">
            <b>{ROLES[user.role]?.label}</b>
            <small>просмотр расписания и статусы</small>
          </div>
        )}
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
            canMove={(b) => can(user, 'move') && isBlocking(b)}
            onPast={() => (haptic('error'), setToast('Это время уже прошло — выберите время позже'))}
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
          user={user}
          users={config.users}
          pricelists={config.pricelists}
          onClose={() => setEditing(null)}
          onSaved={(b) => {
            haptic('success')
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
          user={user}
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
      {panel === 'calc' && (
        <Calculator
          depts={active}
          pricelists={config.pricelists}
          onClose={() => setPanel(null)}
          onBook={
            canBook &&
            ((preset) => {
              setPanel(null)
              openNew(preset)
            })
          }
        />
      )}
      {panel === 'reports' && (
        <ReportsModal
          depts={active}
          canExport={can(user, 'export')}
          onClose={() => setPanel(null)}
          onOpen={(b) => {
            setPanel(null)
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

// Ближайший слот после текущего времени (для сегодняшнего дня)
function nextSlot(dept, date) {
  if (date !== dateKey(new Date())) return dept.open_min
  const now = new Date()
  const m = now.getHours() * 60 + now.getMinutes()
  const slot = Math.ceil(m / dept.step) * dept.step
  return Math.max(dept.open_min, Math.min(slot, dept.close_min - dept.step))
}
