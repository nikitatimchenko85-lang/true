import { useState } from 'react'
import { store } from '../store.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await store.signIn(email.trim(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="login" onSubmit={submit}>
        <img className="login-logo" src="logo.png" alt="TRUE DETAILING" />
        <h1 className="greet">
          Вход для<br />
          сотрудников
        </h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="err">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
        <p className="muted small">Аккаунт выдаёт администратор.</p>
      </form>
    </div>
  )
}
