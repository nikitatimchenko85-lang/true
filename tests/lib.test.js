import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipToDay, computeEnd, findConflict, freePost, workMinutes } from '../src/lib.js'

const settings = { open_min: 540, close_min: 1260, step: 30 } // 09:00–21:00
const b = (id, post, s, e, status = 'planned') => ({ id, service_id: 'tires', post, starts_at: s, ends_at: e, status })

test('конфликт на том же посту', () => {
  const list = [b('1', 1, '2026-10-17T10:00', '2026-10-17T11:00')]
  assert.ok(findConflict(list, b(null, 1, '2026-10-17T10:30', '2026-10-17T11:30')))
  assert.equal(findConflict(list, b(null, 1, '2026-10-17T11:00', '2026-10-17T12:00')), null, 'стык не конфликт')
  assert.equal(findConflict(list, b(null, 2, '2026-10-17T10:30', '2026-10-17T11:30')), null, 'другой пост')
  assert.equal(findConflict(list, { ...b(null, 1, '2026-10-17T10:30', '2026-10-17T11:30'), service_id: 'wrap' }), null)
})

test('отменённые не блокируют, своя запись не конфликтует сама с собой', () => {
  const list = [b('1', 1, '2026-10-17T10:00', '2026-10-17T11:00', 'cancelled'), b('2', 1, '2026-10-17T12:00', '2026-10-17T13:00')]
  assert.equal(findConflict(list, b(null, 1, '2026-10-17T10:00', '2026-10-17T11:00')), null)
  assert.equal(findConflict(list, b('2', 1, '2026-10-17T12:30', '2026-10-17T13:30')), null)
})

test('свободный пост', () => {
  const list = [b('1', 1, '2026-10-17T10:00', '2026-10-17T11:00')]
  const svc = { id: 'tires', posts: 2 }
  assert.equal(freePost(list, svc, b(null, 0, '2026-10-17T10:00', '2026-10-17T11:00')), 2)
  list.push(b('2', 2, '2026-10-17T09:00', '2026-10-17T12:00'))
  assert.equal(freePost(list, svc, b(null, 0, '2026-10-17T10:00', '2026-10-17T11:00')), null)
})

test('длинная работа переносится на следующий день', () => {
  assert.equal(computeEnd('2026-10-17T10:00', 60, settings), '2026-10-17T11:00')
  assert.equal(computeEnd('2026-10-17T18:00', 480, settings), '2026-10-18T14:00')
  assert.equal(computeEnd('2026-10-17T09:00', 720 * 2, settings), '2026-10-18T21:00')
  assert.equal(workMinutes('2026-10-17T18:00', '2026-10-18T14:00', settings), 480)
  assert.equal(workMinutes('2026-10-17T10:00', '2026-10-17T11:30', settings), 90)
})

test('отображение многодневной записи по дням', () => {
  const x = b('1', 1, '2026-10-17T18:00', '2026-10-18T14:00')
  assert.deepEqual(clipToDay(x, '2026-10-17', settings), { start: 1080, end: 1260, continuesBefore: false, continuesAfter: true })
  assert.deepEqual(clipToDay(x, '2026-10-18', settings), { start: 540, end: 840, continuesBefore: true, continuesAfter: false })
  assert.equal(clipToDay(x, '2026-10-19', settings), null)
})
