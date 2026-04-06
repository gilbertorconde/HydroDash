import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

/** Vite preview blocks unknown Host headers unless allowed. Read at `vite preview` startup (set in Docker / .env). */
function previewAllowedHosts(): true | string[] {
  const raw = process.env.PREVIEW_ALLOWED_HOSTS?.trim()
  if (!raw) return true
  const hosts = raw.split(',').map((h) => h.trim()).filter(Boolean)
  return hosts.length > 0 ? hosts : true
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart(),
    react(),
  ],
  preview: {
    allowedHosts: previewAllowedHosts(),
  },
})
