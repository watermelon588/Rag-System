import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy the API through the dev server so the browser sees a single
    // origin. This makes the auth cookies first-party (SameSite=Lax works
    // over plain HTTP in dev) regardless of whether you open the app on
    // localhost or 127.0.0.1 — no cross-site cookie headaches.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
