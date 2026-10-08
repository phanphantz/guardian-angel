import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the same build works at localhost and https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [react()],
  // three.js alone is ~700 kB; fine for a prototype.
  build: { chunkSizeWarningLimit: 2000 },
})
