import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { momentiMiddleware } from './server/api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Backend selection:
// - Django (backend/, default): `npm run dev` proxies /api/* and /uploads/* to
//   the DRF server (python backend/manage.py runserver, default
//   http://127.0.0.1:8000 — override with MOMENTI_DJANGO_ORIGIN).
// - Node (legacy): set MOMENTI_BACKEND=node to embed the zero-dependency
//   server/api.mjs middleware into the dev server instead.
const useDjango = (process.env.MOMENTI_BACKEND || 'django') !== 'node'
const djangoOrigin = process.env.MOMENTI_DJANGO_ORIGIN || 'http://127.0.0.1:8000'

export default defineConfig({
  resolve: {
    alias: {
      // Path alias used across the app (@/pages/..., @/lib/...); previously
      // provided implicitly by the Base44 Vite plugin.
      '@': path.resolve(__dirname, './src'),
    },
  },
  ...(useDjango
    ? {
        server: {
          proxy: {
            '/api': { target: djangoOrigin, changeOrigin: false },
            '/uploads': { target: djangoOrigin, changeOrigin: false },
          },
        },
      }
    : {}),
  plugins: [
    react(),
    ...(useDjango
      ? []
      : [
          {
            name: 'momenti-local-api',
            configureServer(server) {
              // Registered pre-hook so the API middleware wins over Vite's SPA
              // fallback and static middlewares without touching HMR internals.
              server.middlewares.use(momentiMiddleware)
            },
          },
        ]),
  ],
})


