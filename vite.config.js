import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3011,
    /** Evita que Vite pase silencioso a 3012 y pise el API */
    strictPort: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
    },
  },
})
