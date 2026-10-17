import { useState } from 'react'

// Кто записывает на этом устройстве — подставляется в записи как «Администратор»
export default function WhoAmI({ admins, onPick }) {
  const [name, setName] = useState('')
  return (
    <div className="center">
      <div className="login">
        <img className="login-logo" src="logo.png" alt="TRUE DETAILING" />
        <h1 className="greet">Кто вы?</h1>
        <p className="muted">Имя будет стоять в записях, которые вы создаёте с этого устройства.</p>
        <div className="who">
          {admins.map((a) => (
            <button key={a} onClick={() => onPick(a)}>
              {a}
            </button>
          ))}
        </div>
        <form
          className="who-own"
          onSubmit={(e) => {
            e.preventDefault()
            name.trim() && onPick(name.trim())
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Другое имя" />
          <button className="primary" disabled={!name.trim()}>
            Готово
          </button>
        </form>
      </div>
    </div>
  )
}
