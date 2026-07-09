import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        c1: resolve(__dirname, 'c1.html'),
        c2: resolve(__dirname, 'c2.html'),
        c3: resolve(__dirname, 'c3.html'),
      },
    },
  },
})
