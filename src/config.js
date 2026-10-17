// Настройки из базы поверх стандартных: новые поля (пользователи, прайсы) появляются и у старых установок
import { DEFAULT_CONFIG } from './lib.js'
import { DEFAULT_PRICELISTS } from './prices.js'
import { defaultUsers } from './access.js'

export function withDefaults(saved) {
  const cfg = { ...DEFAULT_CONFIG, lock_min: 30, ...(saved || {}) }
  const pricelists = { ...DEFAULT_PRICELISTS, ...(cfg.pricelists || {}) }
  for (const d of cfg.departments) pricelists[d.id] ||= []
  return {
    ...cfg,
    pricelists,
    users: cfg.users?.length ? cfg.users : defaultUsers(cfg.admins),
  }
}
