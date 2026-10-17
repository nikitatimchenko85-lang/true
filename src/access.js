// Пользователи, роли и PIN-коды.
// Пока база не подключена, проверка идёт в браузере: это защита от случайных действий, а не от взлома.

export const PERMS = [
  ['book', 'Создавать и менять записи'],
  ['status', 'Менять статус записи'],
  ['move', 'Переносить записи в сетке'],
  ['price', 'Менять цену в заявке'],
  ['reports', 'Аналитика и отчёты'],
  ['export', 'Выгрузки в Excel'],
  ['pricelists', 'Редактировать прайс-листы'],
  ['settings', 'Подразделения, посты, импорт'],
  ['users', 'Пользователи, права и PIN-коды'],
]

export const ROLES = {
  owner: { label: 'Руководитель', short: 'Руков.', perms: PERMS.map(([k]) => k) },
  admin: { label: 'Администратор', short: 'Админ.', perms: ['book', 'status', 'move', 'price', 'reports', 'export'] },
  master: { label: 'Мастер', short: 'Мастер', perms: ['status'] },
}

// roles — права ролей из настроек ({ admin: [...], master: [...] }), иначе стандартные
export const rolePerms = (role, roles) => roles?.[role] ?? ROLES[role]?.perms ?? []
export const defaultRoles = () => ({ admin: [...ROLES.admin.perms], master: [...ROLES.master.perms] })

// Пользователь с правами, которые действуют сейчас: свои, если заданы, иначе права роли из настроек
export const effectiveUser = (cfg, u) => u && { ...u, perms: u.role === 'owner' ? null : u.perms ?? rolePerms(u.role, cfg.roles) }
export const userPerms = (user) => (user?.role === 'owner' ? ROLES.owner.perms : user?.perms ?? rolePerms(user?.role))

// Руководитель может всё — чтобы нельзя было случайно запереть себя
export const can = (user, perm) => !!user && (user.role === 'owner' || userPerms(user).includes(perm))
export const deptAllowed = (user, id) => !!user && (!user.depts?.length || user.depts.includes(id))

export const defaultUsers = (admins = []) => [
  { id: 'owner', name: 'Руководитель', role: 'owner', perms: null, depts: [], pin: '' },
  ...admins.map((name, i) => ({ id: `u${i + 1}`, name, role: 'admin', perms: null, depts: [], pin: '' })),
]

export async function hashPin(userId, pin) {
  const data = new TextEncoder().encode(`true-detailing:${userId}:${pin}`)
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export const checkPin = async (user, pin) => !!user?.pin && (await hashPin(user.id, pin)) === user.pin

export const validPin = (pin) => /^\d{4,6}$/.test(pin)
