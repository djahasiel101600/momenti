import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { momentiMiddleware } from './server/api.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Fully self-hosted config (no Base44). The local API middleware handles
// /api/* and /uploads/* inside the dev server itself, so `npm run dev`
// starts the whole stack in one process. For production hosting use
// `npm run build && npm start`.
export default defineConfig({
  resolve: {
    alias: {
      // Path alias used across the app (@/pages/..., @/lib/...); previously
      // provided implicitly by the Base44 Vite plugin.
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    {
      name: 'momenti-local-api',
      configureServer(server) {
        // Registered pre-hook so the API middleware wins over Vite's SPA
        // fallback and static middlewares without touching HMR internals.
        server.middlewares.use(momentiMiddleware)
      },
    },
  ],
})

