import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/recalsans-legacy/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
})
