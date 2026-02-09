import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/news-api': {
        target: 'https://gnews.io/api/v4/search',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/news-api/, '')
      }
    }
  }
})
