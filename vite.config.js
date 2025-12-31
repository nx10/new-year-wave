import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/new-year-wave/' : '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/d3')) {
            return 'd3'
          }
          if (id.includes('node_modules/topojson-client')) {
            return 'topojson'
          }
        }
      }
    }
  }
}))