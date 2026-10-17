import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG, bannedBrand } from '../src/lib.js'
import { parseCsv, rowsToBookings } from '../src/importCsv.js'
import { SERVICES, unitPrice } from '../src/prices.js'

const tires = DEFAULT_CONFIG.departments.find((d) => d.id === 'tires')

test('Mercedes на Валькоре — предупреждение, на Автолюксе — нет', () => {
  const [p1, , p3] = tires.posts
  assert.equal(bannedBrand(p3, 'Мерс C300'), 'Mercedes')
  assert.equal(bannedBrand(p3, 'Mercedes-Benz GLE'), 'Mercedes')
  assert.equal(bannedBrand(p3, 'Kia Rio'), null)
  assert.equal(bannedBrand(p1, 'Мерс C300'), null)
})

test('импорт CSV из «Заявки Шиномонтаж»', () => {
  const csv = [
    'Дата заявки,"Автомобиль, гос номер","Клиент, телефон",Класс,Радиус,Вид работы,Комментарий,Дата записи,Время записи,Пост,Администратор,"Длительность, мин",Статус',
    ',Kia Rio (123),"Иван, +7 913 123-45-67",III,R16,Балансировка,"далее мойка",17.10.2026,8:00,Пост 1 Автолюкс,Данилов,,',
    ',Туарег,,,,,,17.10.2026,10:30,Пост 3 Валькор,,90,Не приехал',
    ',,,,,,,17.10.2026,11:00,Пост 1 Автолюкс,,,',
    ',Без поста,,,,,,17.10.2026,11:00,Пост 9,,,',
  ].join('\n')
  const { bookings, errors } = rowsToBookings(parseCsv(csv), tires)
  assert.equal(bookings.length, 2)
  assert.deepEqual(
    { ...bookings[0], tags: undefined },
    {
      service_id: 'tires', post: 1, starts_at: '2026-10-17T08:00', ends_at: '2026-10-17T09:00', car: 'Kia Rio (123)',
      client_name: 'Иван', phone: '+7 913 123-45-67', tire_class: 'III', radius: 'R16', work: 'Балансировка',
      tags: undefined, comment: 'далее мойка', status: 'planned', created_by: 'Данилов',
    },
  )
  assert.equal(bookings[1].post, 3)
  assert.equal(bookings[1].ends_at, '2026-10-17T12:00')
  assert.equal(bookings[1].status, 'no_show')
  assert.deepEqual(errors.map((e) => e.reason), ['нет машины', 'неизвестный пост'])
})

test('калькулятор: цены и подсказки', () => {
  const complex = SERVICES[0]
  assert.deepEqual(unitPrice(complex, 'IV', 'R17'), { price: 4000 })
  assert.deepEqual(unitPrice(complex, '', 'R17'), { hint: 'выберите класс' })
  const camera = SERVICES.find((s) => s.name === 'Камера')
  assert.deepEqual(unitPrice(camera, '', 'R15'), { hint: 'нет в прайсе' })
  assert.deepEqual(unitPrice(camera, '', 'R16'), { price: 1800 })
})
