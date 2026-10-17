import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, nextFreeSlots } from '../src/lib.js'
import { DEFAULT_PRICELISTS, lineFromItem, linesTotal, repriceLines } from '../src/prices.js'
import { can, checkPin, deptAllowed, effectiveUser, hashPin } from '../src/access.js'
import { withDefaults } from '../src/config.js'
import { summarize } from '../src/analytics.js'
import { bookingsCsv, parsePricelist, pricelistCsv, sheetCsv } from '../src/exports.js'
import { parseCsv, rowsToBookings } from '../src/importCsv.js'

const tires = DEFAULT_CONFIG.departments.find((d) => d.id === 'tires')
const list = DEFAULT_PRICELISTS.tires
const item = (id) => list.find((i) => i.id === id)

test('стоимость в заявке пересчитывается при смене класса и радиуса', () => {
  let lines = [lineFromItem(item('complex'), 'III', 'R16'), lineFromItem(item('balance'), 'III', 'R16')]
  assert.deepEqual(lines.map((l) => [l.price, l.qty]), [[3500, 1], [400, 4]])
  assert.equal(linesTotal(lines), 3500 + 1600)
  lines = [...lines, { item_id: null, name: 'Скидка', qty: 1, price: -500, own: true }]
  lines = repriceLines(lines, list, 'IV', 'R18')
  assert.deepEqual(lines.map((l) => l.price), [4200, 450, -500])
  assert.equal(linesTotal(lines), 4200 + 1800 - 500)
  assert.equal(lineFromItem(item('complex'), '', 'R16').price, null)
})

test('ближайшие свободные окна: первый свободный пост, без Mercedes на Валькоре', () => {
  const b = (post, s, e) => ({ id: s + post, service_id: 'tires', post, starts_at: s, ends_at: e, status: 'planned' })
  const busy = [b(1, '2026-10-17T08:00', '2026-10-17T09:00'), b(2, '2026-10-17T08:00', '2026-10-17T09:00')]
  const slots = nextFreeSlots(busy, tires, '2026-10-17T07:40', { count: 3 })
  assert.deepEqual(slots.map((s) => [s.starts_at, s.post]), [['2026-10-17T08:00', 3], ['2026-10-17T08:30', 3], ['2026-10-17T09:00', 1]])
  const merc = nextFreeSlots(busy, tires, '2026-10-17T08:00', { count: 1, car: 'Мерс E200' })
  assert.deepEqual(merc.map((s) => [s.starts_at, s.post]), [['2026-10-17T09:00', 1]])
  const late = nextFreeSlots([], tires, '2026-10-17T22:50', { count: 1 })
  assert.equal(late[0].starts_at, '2026-10-18T08:00')
})

test('роли, права и PIN', async () => {
  const cfg = withDefaults({ admins: ['Данилов'] })
  const [owner, admin] = cfg.users
  assert.equal(owner.role, 'owner')
  assert.ok(can(owner, 'users') && can(admin, 'book') && !can(admin, 'users'))
  const master = { id: 'm', role: 'master', depts: ['service'] }
  assert.ok(can(master, 'status') && !can(master, 'book'))
  assert.ok(deptAllowed(master, 'service') && !deptAllowed(master, 'tires') && deptAllowed(admin, 'tires'))
  assert.ok(can({ role: 'master', perms: ['reports'] }, 'reports'), 'свои права важнее роли')
  const u = { id: 'u1', pin: await hashPin('u1', '1234') }
  assert.ok(await checkPin(u, '1234'))
  assert.ok(!(await checkPin(u, '4321')))
  assert.ok(!(await checkPin({ id: 'u2', pin: u.pin }, '1234')), 'хэш привязан к пользователю')
  assert.deepEqual(Object.keys(cfg.pricelists).sort(), ['anticor', 'detailing', 'service', 'tires', 'wash'])
})

test('аналитика за период', () => {
  const b = (id, d, status, total, extra = {}) => ({
    id, service_id: 'tires', post: 1, starts_at: `${d}T10:00`, ends_at: `${d}T11:00`, status, total, created_by: 'Данилов', ...extra,
  })
  const bookings = [
    b('1', '2026-10-16', 'planned', 4700, { items: [{ name: 'Комплексный шиномонтаж', qty: 1, price: 4700 }] }),
    b('2', '2026-10-17', 'done', 1300),
    b('3', '2026-10-17', 'no_show', 3000),
    b('4', '2026-10-17', 'cancelled', 9000),
    b('5', '2026-10-18', 'planned', 500),
    b('6', '2026-10-17', 'planned', 800, { service_id: 'wash' }),
  ]
  const s = summarize(bookings, [tires], '2026-10-16', '2026-10-17')
  assert.equal(s.count, 3)
  assert.equal(s.revenue, 6000)
  assert.equal(s.avg, 3000)
  assert.equal(s.noShow, 1)
  assert.equal(s.cancelled, 1)
  assert.deepEqual(s.byDay.map((d) => [d.date, d.count, d.revenue]), [['2026-10-16', 1, 4700], ['2026-10-17', 2, 1300]])
  assert.deepEqual(s.byService.map((x) => [x.name, x.qty, x.revenue]), [['Комплексный шиномонтаж', 1, 4700]])
  assert.equal(s.byAdmin[0].revenue, 6000)
  // 2 часа из 2 дней × 4 постов × 15 часов
  assert.equal(s.load, 120 / (2 * 4 * 900))
})

test('выгрузка в формате таблицы читается импортом обратно', () => {
  const b = {
    service_id: 'tires', post: 3, starts_at: '2026-10-17T10:30', ends_at: '2026-10-17T12:00', car: 'Туарег; А123',
    client_name: 'Иван', phone: '+7 913 123-45-67', tire_class: 'III', radius: 'R18', work: 'Балансировка', tags: ['хранение'],
    comment: 'с "секретками"', status: 'no_show', created_by: 'Данилов', created_at: '2026-10-15T08:00:00Z',
  }
  const csv = sheetCsv([b], tires)
  assert.ok(csv.startsWith('﻿') && csv.includes('\r\n'))
  const [back] = rowsToBookings(parseCsv(csv), tires).bookings
  assert.equal(back.car, b.car)
  assert.equal(back.post, 3)
  assert.equal(back.starts_at, b.starts_at)
  assert.equal(back.ends_at, b.ends_at)
  assert.equal(back.status, 'no_show')
  assert.equal(back.phone, b.phone)
  assert.equal(back.comment, 'хранение, с "секретками"')
  assert.ok(bookingsCsv([{ ...b, items: [{ name: 'Балансировка', qty: 4, price: 450 }], total: 1800 }], [tires]).includes('Балансировка × 4 = 1800'))
})

test('прайс-лист: выгрузка и загрузка без потерь', () => {
  const { list: back, errors } = parsePricelist(parseCsv(pricelistCsv(list)))
  assert.deepEqual(errors, [])
  assert.deepEqual(back, list.map((i) => ({ from: false, ...i })))
})

test('права ролей из настроек и исполнитель в отчёте', () => {
  const cfg = withDefaults({ admins: ['Данилов'], roles: { master: ['status', 'reports'] } })
  const master = effectiveUser(cfg, { id: 'm', name: 'Петров', role: 'master', perms: null })
  assert.ok(can(master, 'reports') && !can(master, 'book'))
  assert.ok(can(effectiveUser(cfg, cfg.users[1]), 'book'), 'у администратора стандартные права')
  assert.ok(!can(effectiveUser(cfg, { id: 'x', role: 'master', perms: ['book'] }), 'reports'), 'свои права важнее роли')
  assert.ok(can(effectiveUser(cfg, cfg.users[0]), 'users'))
  const b = { id: '1', service_id: 'tires', post: 1, starts_at: '2026-10-17T10:00', ends_at: '2026-10-17T11:00', status: 'planned', total: 1000, executor: 'Петров' }
  const s = summarize([b, { ...b, id: '2', executor: '' }], [tires], '2026-10-17', '2026-10-17')
  assert.deepEqual(s.byExecutor.map((x) => [x.name, x.count, x.revenue]), [['Петров', 1, 1000]])
  assert.ok(bookingsCsv([b], [tires]).includes('Петров'))
})

test('проверка телефона и пометки по подразделениям', async () => {
  const { phoneError, formatPhone, tagsFor } = await import('../src/lib.js')
  assert.equal(phoneError(''), '')
  assert.equal(phoneError('+7 913 123-45-67'), '')
  assert.equal(phoneError('8 (913) 123 45 67'), '')
  assert.equal(phoneError('9131234567'), '')
  assert.equal(formatPhone('9131234567'), '+7 (913) 123-45-67')
  assert.match(phoneError('913 12'), /не хватает/i)
  assert.match(phoneError('+7 913 123-45-678'), /лишние/i)
  assert.match(phoneError('Иван'), /только цифры/i)
  const wash = DEFAULT_CONFIG.departments.find((d) => d.id === 'wash')
  assert.ok(!tagsFor(wash).includes('далее мойка') && !tagsFor(wash).includes('Run Flat'))
  assert.ok(tagsFor(tires).includes('Run Flat'))
  assert.deepEqual(tagsFor({ ...wash, tags: ['VIP'] }), ['VIP'])
})
