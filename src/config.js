// Настройки из базы поверх стандартных: новые поля (пользователи, прайсы) появляются и у старых установок
import { DEFAULT_CONFIG } from './lib.js'
import { DEFAULT_PRICELISTS } from './prices.js'
import { defaultRoles, defaultUsers } from './access.js'
import { DEFAULT_WAREHOUSES } from './storage.js'

// Старые стандартные цвета подразделений → новые (свои цвета, выбранные в настройках, не трогаем)
const OLD_COLORS = { '#16a34a': '#1fae78', '#0891b2': '#1e9be0', '#d97706': '#ee6516', '#7c3aed': '#8a6cf5', '#64748b': '#a8a29e' }

export function withDefaults(saved) {
  const merged = { ...DEFAULT_CONFIG, lock_min: 30, ...(saved || {}) }
  const cfg = { ...merged, departments: merged.departments.map((d) => (OLD_COLORS[d.color] ? { ...d, color: OLD_COLORS[d.color] } : d)) }
  const pricelists = { ...DEFAULT_PRICELISTS, ...(cfg.pricelists || {}) }
  for (const d of cfg.departments) pricelists[d.id] ||= []
  let users = cfg.users?.length ? cfg.users : defaultUsers(cfg.admins)
  let roles = { ...defaultRoles(), ...(cfg.roles || {}) }
  // v2.0: хранение шин — администраторам и тем, кто может записывать, право выдаётся один раз
  if ((cfg.perm_version || 1) < 2) {
    const add = (list) => (list && list.includes('book') && !list.includes('storage') ? [...list, 'storage'] : list)
    roles = { ...roles, admin: add(roles.admin) }
    users = users.map((u) => (u.perms ? { ...u, perms: add(u.perms) } : u))
  }
  return { ...cfg, pricelists, users, roles, warehouses: cfg.warehouses || DEFAULT_WAREHOUSES, perm_version: 2 }
}
