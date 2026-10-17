import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Страница целиком не масштабируется щипком — масштаб меняется только у сетки (см. DayGrid)
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false })

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
