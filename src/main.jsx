import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { haptic, startupHaptic } from './haptics.js'

// Страница целиком не масштабируется щипком — масштаб меняется только у сетки (см. DayGrid)
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false })

// Виброотклик: нарастающая при запуске, лёгкий тик на кнопки-варианты
startupHaptic()
document.addEventListener('click', (e) => e.target.closest?.('.presets button, .tagbar button, .tabs button, .week .day') && haptic('tap'))

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
