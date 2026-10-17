// Настройки из базы поверх стандартных: новые поля (пользователи, прайсы) появляются и у старых установок
import { DEFAULT_CONFIG } from './lib.js'
import { DEFAULT_PRICELISTS } from './prices.js'
import { defaultRoles, defaultUsers } from './access.js'

// Старые стандартные цвета подразделений → новые (свои цвета, выбранные в настройках, не трогаем)
const OLD_COLORS = { '#16a34a': '#1fae78', '#0891b2': '#1e9be0', '#d97706': '#ee6516', '#7c3aed': '#8a6cf5', '#64748b': '#a8a29e' }

export function withDefaults(saved) {
  const merged = { ...DEFAULT_CONFIG, lock_min: 30, ...(saved || {}) }
  const cfg = { ...merged, departments: merged.departments.map((d) => (OLD_COLORS[d.color] ? { ...d, color: OLD_COLORS[d.color] } : d)) }
  const pricelists = { ...DEFAULT_PRICELISTS, ...(cfg.pricelists || {}) }
  for (const d of cfg.departments) pricelists[d.id] ||= []
  return {
    ...cfg,
    pricelists,
    users: cfg.users?.length ? cfg.users : defaultUsers(cfg.admins),
    roles: { ...defaultRoles(), ...(cfg.roles || {}) },
  }
}
