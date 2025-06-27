import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      process: resolve(__dirname, 'node_modules/process/browser.js'),
      stream: resolve(__dirname, 'node_modules/stream-browserify'),
      zlib: resolve(__dirname, 'node_modules/browserify-zlib'),
      util: resolve(__dirname, 'node_modules/util'),
      buffer: resolve(__dirname, 'node_modules/buffer'),
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    },
    include: ['buffer', 'process', 'stream-browserify', 'browserify-zlib', 'util']
  },
  build: {
    rollupOptions: {
      external: ['fsevents'],
    },
  }
}) 