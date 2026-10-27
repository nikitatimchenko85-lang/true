// Слой данных. Сейчас всё хранится в браузере (localStorage).
// Когда приложение переедет на хостинг TRUE, сюда подключается сервер: достаточно реализовать те же методы
// (listBookings, searchBookings, saveBooking, importBookings, getConfig, saveConfig, addLog, listLog, listStorage, saveStorage, subscribe)
// поверх его API — остальное приложение менять не нужно.
import { findConflict, uid } from './lib.js'
import { withDefaults } from './config.js'
import { bookingEntry, configNote } from './journal.js'
import { cellFree, nextNum, storageEntry } from './storage.js'

export class CellBusyError extends Error {
  constructor() {
    super('Эта ячейка уже занята — выберите другую')
  }
}

export class ConflictError extends Error {
  constructor(booking) {
    super('Это время на выбранном посту уже занято')
    this.booking = booking
  }
}

const LOG_LIMIT = 5000 // сколько последних действий хранить в браузере

// Журнал не должен ломать сохранение: ошибки записи в журнал только в консоль
const quiet = (p) => Promise.resolve(p).catch((e) => console.warn('Журнал:', e?.message || e))

// Настройки, которые сохраняют вместе с журналом: by — кто, action — settings или pin
const configEntry = (by, prev, next, action = 'settings', note) =>
  by && { user_name: by, action, note: note ?? configNote(prev, next) }

function createLocalStore() {
  const KEY = { bookings: 'db.bookings', config: 'db.config', log: 'db.log', storage: 'db.storage' }
  const read = (k, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(k))
      return v ?? fallback
    } catch {
      return fallback
    }
  }
  const listeners = new Set()
  const emit = () => listeners.forEach((fn) => fn())
  const write = (k, v) => {
    localStorage.setItem(k, JSON.stringify(v))
    emit()
  }
  window.addEventListener('storage', (e) => Object.values(KEY).includes(e.key) && emit())

  return {
    mode: 'local',
    async listBookings(from, to) {
      return read(KEY.bookings, []).filter((b) => b.starts_at < to && b.ends_at > from)
    },
    async searchBookings(q) {
      const s = q.toLowerCase()
      const digits = q.replace(/\D/g, '')
      return read(KEY.bookings, [])
        .filter(
          (b) =>
            b.client_name?.toLowerCase().includes(s) ||
            b.car?.toLowerCase().includes(s) ||
            (digits.length >= 3 && b.phone?.replace(/\D/g, '').includes(digits)),
        )
        .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
        .slice(0, 50)
    },
    async saveBooking(b, by) {
      const all = read(KEY.bookings, [])
      const conflict = findConflict(all, b)
      if (conflict) throw new ConflictError(conflict)
      const now = new Date().toISOString()
      const prev = b.id && all.find((x) => x.id === b.id)
      let saved = b
      if (b.id) write(KEY.bookings, all.map((x) => (x.id === b.id ? { ...x, ...b, updated_at: now } : x)))
      else {
        saved = { ...b, id: uid(), created_at: now, updated_at: now }
        write(KEY.bookings, [...all, saved])
      }
      if (by) await this.addLog(bookingEntry(by, prev, saved))
      return saved
    },
    async addLog(e) {
      if (!e) return
      const list = read(KEY.log, [])
      list.push({ ...e, id: uid(), at: new Date().toISOString() })
      // без emit: журнал не должен перезагружать сетку
      await quiet(new Promise((ok) => ok(localStorage.setItem(KEY.log, JSON.stringify(list.slice(-LOG_LIMIT))))))
    },
    async listLog({ from, to, bookingId, limit = 500 } = {}) {
      return read(KEY.log, [])
        .filter((e) => (!bookingId || e.booking_id === bookingId) && (!from || e.at >= from) && (!to || e.at < to))
        .reverse()
        .slice(0, limit)
    },
    async importBookings(list, by) {
      const all = read(KEY.bookings, [])
      const now = new Date().toISOString()
      let added = 0
      const skipped = []
      for (const b of list) {
        if (findConflict(all, b)) skipped.push(b)
        else {
          all.push({ ...b, id: uid(), created_at: now, updated_at: now })
          added++
        }
      }
      write(KEY.bookings, all)
      if (by && added) await this.addLog({ user_name: by, action: 'import', note: `${added} шт.` })
      return { added, skipped }
    },
    async listStorage() {
      return read(KEY.storage, [])
    },
    // Комплект на хранении. action для журнала: storage_in, storage_out, storage_move, storage_edit
    async saveStorage(s, by, action, warehouses) {
      const all = read(KEY.storage, [])
      if (s.status !== 'issued') {
        const w = warehouses.find((x) => x.id === s.warehouse_id)
        const r = w?.racks.find((x) => x.id === s.rack_id)
        if (!r || !cellFree(all, w, r, s.section, s.level, s.id)) throw new CellBusyError()
      }
      const now = new Date().toISOString()
      let saved
      if (s.id) {
        saved = { ...all.find((x) => x.id === s.id), ...s, updated_at: now }
        write(KEY.storage, all.map((x) => (x.id === s.id ? saved : x)))
      } else {
        saved = { ...s, id: uid(), num: nextNum(all), created_at: now, updated_at: now }
        write(KEY.storage, [...all, saved])
      }
      if (by && action) await this.addLog(storageEntry(by, action, saved, warehouses))
      return saved
    },
    async getConfig() {
      return withDefaults(read(KEY.config, null))
    },
    async saveConfig(cfg, by, action, note) {
      const prev = read(KEY.config, null)
      write(KEY.config, cfg)
      if (by) await this.addLog(configEntry(by, withDefaults(prev), cfg, action, note))
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export const store = createLocalStore()
