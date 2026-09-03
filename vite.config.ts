import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_PORT = Number(process.env.API_PORT ?? 5177)

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/uploads': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      '/out': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
  },
})
