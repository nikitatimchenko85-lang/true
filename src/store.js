// Слой данных. Два варианта с одинаковым API:
//  - Supabase (общая база для всех сотрудников, синхронизация в реальном времени)
//  - localStorage (если Supabase не настроен — работает сразу, но только в этом браузере)
import { createClient } from '@supabase/supabase-js'
import { findConflict, normStamp, uid } from './lib.js'
import { withDefaults } from './config.js'
import { bookingEntry, configNote } from './journal.js'

export class ConflictError extends Error {
  constructor(booking) {
    super('Это время на выбранном посту уже занято')
    this.booking = booking
  }
}

const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const BOOKING_FIELDS = [
  'service_id', 'post', 'starts_at', 'ends_at', 'car', 'client_name', 'phone', 'work',
  'tire_class', 'radius', 'tags', 'comment', 'status', 'created_by', 'items', 'total', 'executor',
]

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]))
const LOG_LIMIT = 5000 // сколько последних действий хранить в браузере

// Журнал не должен ломать сохранение: ошибки записи в журнал только в консоль
const quiet = (p) => Promise.resolve(p).catch((e) => console.warn('Журнал:', e?.message || e))

// Настройки, которые сохраняют вместе с журналом: by — кто, action — settings или pin
const configEntry = (by, prev, next, action = 'settings', note) =>
  by && { user_name: by, action, note: note ?? configNote(prev, next) }

/* ---------------- localStorage ---------------- */

function createLocalStore() {
  const KEY = { bookings: 'db.bookings', config: 'db.config', log: 'db.log' }
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
    async getSession() {
      return { user: { email: 'local' } }
    },
    onAuthChange() {
      return () => {}
    },
    async signIn() {},
    async signOut() {},
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

/* ---------------- Supabase ---------------- */

function createSupabaseStore() {
  const sb = createClient(SB_URL, SB_KEY)
  const norm = (b) => ({ ...b, starts_at: normStamp(b.starts_at), ends_at: normStamp(b.ends_at) })
  const check = ({ data, error }) => {
    if (error) throw error
    return data
  }

  return {
    mode: 'supabase',
    async getSession() {
      return (await sb.auth.getSession()).data.session
    },
    onAuthChange(fn) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => fn(session))
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error('Неверный email или пароль')
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async listBookings(from, to) {
      // Supabase отдаёт не больше 1000 строк за раз — для отчётов за месяц читаем страницами
      const out = []
      for (let i = 0; ; i += 1000) {
        const page = check(
          await sb.from('bookings').select('*').lt('starts_at', to).gt('ends_at', from).order('starts_at').range(i, i + 999),
        )
        out.push(...page)
        if (page.length < 1000) return out.map(norm)
      }
    },
    async searchBookings(q) {
      const s = q.replace(/[%,()]/g, ' ').trim()
      const digits = q.replace(/\D/g, '')
      const ors = [`client_name.ilike.%${s}%`, `car.ilike.%${s}%`, `comment.ilike.%${s}%`]
      if (digits.length >= 3) ors.push(`phone_digits.like.%${digits}%`)
      const data = check(
        await sb.from('bookings').select('*').or(ors.join(',')).order('starts_at', { ascending: false }).limit(50),
      )
      return data.map(norm)
    },
    async saveBooking(b, by) {
      const row = pick(b, BOOKING_FIELDS)
      const prev = by && b.id ? (await sb.from('bookings').select('*').eq('id', b.id).maybeSingle()).data : null
      const res = b.id
        ? await sb.from('bookings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', b.id).select().single()
        : await sb.from('bookings').insert(row).select().single()
      // 23P01 — нарушение ограничения "нет пересечений" в базе
      if (res.error?.code === '23P01') throw new ConflictError(null)
      const saved = norm(check(res))
      if (by) await this.addLog(bookingEntry(by, prev && norm(prev), saved))
      return saved
    },
    async addLog(e) {
      if (e) await quiet(sb.from('activity_log').insert(e).then(check))
    },
    async listLog({ from, to, bookingId, limit = 500 } = {}) {
      let q = sb.from('activity_log').select('*').order('at', { ascending: false }).limit(limit)
      if (bookingId) q = q.eq('booking_id', bookingId)
      if (from) q = q.gte('at', from)
      if (to) q = q.lt('at', to)
      return check(await q)
    },
    async importBookings(list, by) {
      let added = 0
      const skipped = []
      // По одной, чтобы пересечения отсеялись базой и не сорвали весь импорт
      for (const b of list) {
        const res = await sb.from('bookings').insert(pick(b, BOOKING_FIELDS))
        if (res.error?.code === '23P01') skipped.push(b)
        else if (res.error) throw res.error
        else added++
      }
      if (by && added) await this.addLog({ user_name: by, action: 'import', note: `${added} шт.` })
      return { added, skipped }
    },
    async getConfig() {
      const data = check(await sb.from('app_settings').select('value').eq('id', 1).maybeSingle())
      return withDefaults(data?.value)
    },
    async saveConfig(cfg, by, action, note) {
      const prev = by && (await this.getConfig())
      check(await sb.from('app_settings').upsert({ id: 1, value: cfg }))
      if (by) await this.addLog(configEntry(by, prev, cfg, action, note))
    },
    subscribe(fn) {
      const ch = sb
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fn)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, fn)
        .subscribe()
      return () => sb.removeChannel(ch)
    },
  }
}

export const store = SB_URL && SB_KEY ? createSupabaseStore() : createLocalStore()
