import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' — сборка работает в любой папке (GitHub Pages /<repo>/, timchenko.site/<папка>/).
// assetsDir: '' — все файлы в одной папке: хостинг TRUE не поддерживает вложенные папки
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { assetsDir: '' },
})
