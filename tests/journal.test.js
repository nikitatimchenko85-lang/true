import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from '../src/lib.js'
import { bookingEntry, configNote, describeChanges } from '../src/journal.js'
import { CHANGELOG, VERSION } from '../src/changelog.js'

const depts = DEFAULT_CONFIG.departments
const base = { id: 'b1', service_id: 'tires', post: 1, starts_at: '2026-10-17T12:00', ends_at: '2026-10-17T13:00', car: 'Kia', status: 'planned', tags: [] }

test('журнал: новая запись, перенос, статус, правка', () => {
  assert.equal(bookingEntry('Анна', null, base).action, 'create')
  const moved = bookingEntry('Анна', base, { ...base, post: 2, starts_at: '2026-10-17T14:00', ends_at: '2026-10-17T15:00' })
  assert.equal(moved.action, 'move')
  const rows = describeChanges(moved, depts)
  assert.deepEqual(rows.find((r) => r.label === 'Пост'), { label: 'Пост', from: depts[0].posts[0].name, to: depts[0].posts[1].name })
  assert.equal(bookingEntry('Анна', base, { ...base, status: 'done' }).action, 'status')
  assert.equal(bookingEntry('Анна', base, { ...base, car: 'Kia Rio', comment: '' }).action, 'update')
  // пустое → пустое и пост строкой не считаются изменением
  assert.equal(bookingEntry('Анна', { ...base, comment: null }, { ...base, post: '1', comment: '' }), null)
})

test('журнал: какие настройки поменялись', () => {
  assert.equal(configNote({ lock_min: 30, users: [] }, { lock_min: 60, users: [] }), 'автоблокировка')
})

test('история версий: новая сверху', () => {
  assert.equal(VERSION, CHANGELOG[0].version)
  assert.ok(CHANGELOG.every((v, i) => !i || Number(CHANGELOG[i - 1].version) > Number(v.version)))
})
