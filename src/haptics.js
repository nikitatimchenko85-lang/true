// Виброотклик.
// Android (Chrome): navigator.vibrate — любые узоры, но только после первого касания страницы.
// iPhone (Safari, iOS 18+): navigator.vibrate нет; короткий «тик» даёт переключатель <input switch>,
// поэтому узоры на iPhone — серия тиков. Если ничего не поддерживается — тихо ничего не делаем.

const PATTERNS = {
  tap: [8],
  select: [12],
  success: [15, 60, 25],
  error: [40, 50, 40, 50, 40],
  // длинная нарастающая — при входе в приложение
  ramp: [6, 70, 9, 60, 12, 50, 16, 40, 22, 30, 30, 22, 42, 16, 60, 10, 90],
}

let iosLabel = null
function iosTick() {
  if (!iosLabel) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.id = 'haptic-switch'
    iosLabel = document.createElement('label')
    iosLabel.htmlFor = input.id
    iosLabel.style.display = 'none'
    iosLabel.append(input)
    document.body.append(iosLabel)
  }
  iosLabel.click()
}

const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
const isIOS = () => typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent)

export function haptic(kind = 'tap') {
  const pattern = PATTERNS[kind] || PATTERNS.tap
  try {
    if (canVibrate()) return navigator.vibrate(pattern)
    if (!isIOS()) return false
    // на iPhone — тик на каждый импульс узора (паузы сохраняются)
    let t = 0
    pattern.forEach((ms, i) => {
      if (i === 0) iosTick() // первый тик — сразу, внутри касания
      else if (i % 2 === 0) setTimeout(iosTick, t)
      t += ms
    })
    return true
  } catch {
    return false
  }
}

// Нарастающая вибрация при запуске: браузеры разрешают вибрацию только после касания,
// поэтому если сразу не получилось — играем её на первое касание.
export function startupHaptic() {
  const ok = canVibrate() && navigator.userActivation?.hasBeenActive && haptic('ramp')
  if (ok) return
  const once = () => {
    window.removeEventListener('pointerdown', once, true)
    haptic('ramp')
  }
  window.addEventListener('pointerdown', once, true)
}
