import { useCallback, useEffect, useState } from 'react'
import { ROLES, checkPin, hashPin } from '../access.js'

const LEN = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

// Вход по PIN: выбрать себя и ввести 4 цифры. Первый вход — придумать PIN.
export default function PinLogin({ users, lastId, onLogin, onSetPin }) {
  const [user, setUser] = useState(() => users.find((u) => u.id === lastId) || null)
  const [pin, setPin] = useState('')
  const [first, setFirst] = useState('') // при создании PIN — первый ввод
  const [error, setError] = useState('')
  const [fails, setFails] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const creating = user && !user.pin

  const reset = () => {
    setPin('')
    setFirst('')
    setError('')
  }

  const submit = useCallback(
    async (value) => {
      if (creating) {
        if (!first) {
          setFirst(value)
          setPin('')
          return
        }
        if (value !== first) {
          setError('PIN не совпал, придумайте заново')
          setFirst('')
          setPin('')
          return
        }
        await onSetPin(user, await hashPin(user.id, value))
        return onLogin(user)
      }
      if (await checkPin(user, value)) return onLogin(user)
      const n = fails + 1
      setFails(n)
      setPin('')
      if (n >= 5) {
        setLockedUntil(Date.now() + 30_000)
        setFails(0)
        setError('Слишком много попыток. Подождите 30 секунд.')
      } else setError('Неверный PIN')
    },
    [creating, first, user, fails, onLogin, onSetPin],
  )

  const press = useCallback(
    (k) => {
      if (Date.now() < lockedUntil) return
      if (k === '⌫') return setPin((p) => p.slice(0, -1))
      if (!/^\d$/.test(k)) return
      if (pin.length >= LEN) return
      setError('')
      const next = pin + k
      setPin(next)
      if (next.length === LEN) submit(next)
    },
    [pin, lockedUntil, submit],
  )

  useEffect(() => {
    if (!user) return
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('⌫')
      else if (e.key === 'Escape') setUser(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user, press])

  return (
    <div className="center">
      <div className="login pin">
        <img className="login-logo" src="logo.png" alt="TRUE DETAILING" />
        {!user ? (
          <>
            <h1 className="greet">Кто работает?</h1>
            <div className="who">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setUser(u)
                    reset()
                  }}
                >
                  {u.name}
                  <small>{ROLES[u.role]?.label}</small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="link back" onClick={() => setUser(null)}>
              ← Другой сотрудник
            </button>
            <h1 className="greet">{user.name}</h1>
            <p className="muted">
              {creating ? (first ? 'Повторите PIN' : 'Придумайте PIN из 4 цифр. Его будете вводить при входе.') : 'Введите PIN'}
            </p>
            <div className={`dots ${error ? 'shake' : ''}`} aria-live="polite">
              {Array.from({ length: LEN }, (_, i) => (
                <i key={i} className={i < pin.length ? 'on' : ''} />
              ))}
            </div>
            {error && <div className="err">{error}</div>}
            <div className="keypad">
              {KEYS.map((k, i) =>
                k ? (
                  <button key={i} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Стереть' : k}>
                    {k}
                  </button>
                ) : (
                  <span key={i} />
                ),
              )}
            </div>
            {!creating && <p className="muted small">Забыли PIN? Руководитель сбросит его в Настройках → Пользователи.</p>}
          </>
        )}
      </div>
    </div>
  )
}
