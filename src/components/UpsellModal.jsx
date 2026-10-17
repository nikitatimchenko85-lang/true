import { fromMin, nextFreeSlots, splitStamp, weekday } from '../lib.js'
import Modal from './Modal.jsx'

// Допродажа: после новой записи предлагаем записать ту же машину в другие подразделения —
// с ближайшим свободным временем после окончания этой записи
export default function UpsellModal({ booking, depts, bookings, onPick, onClose }) {
  const all = [...bookings.filter((x) => x.id !== booking.id), booking]
  const endDay = booking.ends_at.slice(0, 10)
  const offers = depts
    .filter((d) => d.id !== booking.service_id)
    .map((d) => ({ d, slot: nextFreeSlots(all, d, booking.ends_at, { count: 1, car: booking.car })[0] }))

  return (
    <Modal title="Записать дальше?" onClose={onClose}>
      <div className="form upsell">
        <div className="chain">
          <b>{booking.car}</b>
          <span className="muted small">Предложите клиенту следующую услугу. Время — ближайшее свободное после этой записи.</span>
          <div className="chain-btns">
            {offers.map(({ d, slot }) => {
              const at = splitStamp(slot ? slot.starts_at : booking.ends_at)
              return (
                <button
                  type="button"
                  key={d.id}
                  style={{ '--c': d.color }}
                  onClick={() =>
                    onPick({ service_id: d.id, ...at, post: slot?.post, car: booking.car, client_name: booking.client_name, phone: booking.phone, tire_class: booking.tire_class, radius: booking.radius })
                  }
                >
                  <i />
                  <span>
                    + {d.name}
                    {slot && <small>{at.date === endDay ? '' : weekday(at.date) + ' '}{fromMin(at.min)}</small>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="buttons">
          <button type="button" onClick={onClose}>Не нужно</button>
        </div>
      </div>
    </Modal>
  )
}
