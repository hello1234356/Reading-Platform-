import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/isbn-work-api': {
        target: 'https://data.isbn.work',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/isbn-work-api/, ''),
      },
      '/open-library-api': {
        target: 'https://openlibrary.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/open-library-api/, ''),
      },
    },
  },
})
