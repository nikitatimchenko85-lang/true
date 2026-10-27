import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WAREHOUSES, cellFree, firstFreeCell, formatNum, locationOf, nextNum, occupancy, overdue, searchSets, setsForClient, warehouseStats,
} from '../src/storage.js'
import { withDefaults } from '../src/config.js'

const wh = DEFAULT_WAREHOUSES
const [w] = wh
const [rack] = w.racks
const set = (o) => ({ id: o.id, num: o.num, status: 'stored', season: 'winter', warehouse_id: 'c1', rack_id: 'a', section: 1, level: 1, ...o })

test('хранение: занятость ячеек и первая свободная — снизу слева', () => {
  const sets = [set({ id: '1', num: 1 }), set({ id: '2', num: 2, section: 2 }), set({ id: '3', num: 3, section: 3, status: 'issued' })]
  assert.equal(cellFree(sets, w, rack, 1, 1), false)
  assert.equal(cellFree(sets, w, rack, 1, 1, '1'), true, 'свой комплект не мешает')
  assert.equal(cellFree(sets, w, rack, 3, 1), true, 'выданный ячейку не занимает')
  assert.deepEqual(firstFreeCell(sets, wh), { warehouse_id: 'c1', rack_id: 'a', section: 3, level: 1 })
  assert.equal(Object.keys(occupancy(sets)).length, 2)
  assert.deepEqual(warehouseStats(w, sets), { total: 30, used: 2, winter: 2, summer: 0 })
  assert.equal(cellFree(sets, w, { ...rack, capacity: 2 }, 1, 1), true, 'в ячейку на два комплекта влезает второй')
})

test('хранение: номер, адрес, поиск, срок', () => {
  assert.equal(nextNum([{ num: 4 }, { num: 11 }]), 12)
  assert.equal(formatNum(12), '0012')
  const s = set({ id: '1', num: 12, car: 'Kia Rio А123', phone: '+7 (999) 123-45-67', size: '205/55 R16', section: 2, level: 3, until: '2026-05-15' })
  assert.equal(locationOf(s, wh).full, 'Контейнер 1 · А-2-3')
  assert.equal(searchSets([s], '0012').length, 1)
  assert.equal(searchSets([s], 'r16').length, 1)
  assert.equal(searchSets([s], '1234567').length, 1)
  assert.equal(searchSets([s], 'bmw').length, 0)
  assert.equal(overdue(s, '2026-06-01'), true)
  assert.equal(overdue({ ...s, status: 'issued' }, '2026-06-01'), false)
  assert.equal(setsForClient([s], { phone: '89991234567' }).length, 1)
  assert.equal(setsForClient([s], { car: ' kia rio а123 ' }).length, 1)
})

test('хранение: права выдаются один раз тем, кто может записывать', () => {
  const cfg = withDefaults({ roles: { admin: ['book'], master: ['status'] }, users: [{ id: 'u1', name: 'А', role: 'admin', perms: ['book'] }, { id: 'u2', name: 'Б', role: 'master', perms: ['status'] }] })
  assert.deepEqual(cfg.roles.admin, ['book', 'storage'])
  assert.deepEqual(cfg.users.map((u) => u.perms), [['book', 'storage'], ['status']])
  assert.equal(cfg.warehouses.length, 1)
  const again = withDefaults({ ...cfg, roles: { admin: ['book'] } })
  assert.deepEqual(again.roles.admin, ['book'], 'снятое руководителем право не возвращается')
})
