import { CHANGELOG } from '../changelog.js'
import { humanDate } from '../lib.js'
import Modal from './Modal.jsx'

export default function VersionsModal({ onClose }) {
  return (
    <Modal title="Обновления" onClose={onClose}>
      <div className="versions">
        {CHANGELOG.map((v, i) => (
          <section key={v.version} className={i === 0 ? 'latest' : ''}>
            <div className="v-head">
              <b>{v.version}</b>
              <span>{v.title}</span>
              <small>{humanDate(v.date)}</small>
            </div>
            <ul>
              {v.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
