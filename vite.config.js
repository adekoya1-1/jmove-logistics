import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],

  // ── Build optimizations ────────────────────────────────────────────────
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    // Target modern browsers — smaller bundles, no legacy polyfills
    target: ['es2020', 'chrome90', 'firefox88', 'safari14'],
    chunkSizeWarningLimit: 600,
    cssCodeSplit: true,    // Per-route CSS chunks → only load what's needed
    // Inline assets smaller than 4KB as base64 → fewer HTTP requests
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // ── Manual chunk splitting for best caching & LCP ─────────────────
        manualChunks(id) {
          // Core React runtime — cached forever, never changes
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'react-core';
          }
          // Router — changes infrequently
          if (id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/@remix-run/')) {
            return 'router';
          }
          // react-helmet-async — small, but keep isolated for caching
          if (id.includes('node_modules/react-helmet-async/')) {
            return 'helmet';
          }
          // Heavy chart library — only loaded in admin analytics
          if (id.includes('node_modules/recharts/') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-')) {
            return 'charts';
          }
          // Map / Leaflet — only loaded on admin map page
          if (id.includes('node_modules/leaflet/') ||
              id.includes('node_modules/react-leaflet/') ||
              id.includes('node_modules/@react-leaflet/')) {
            return 'maps';
          }
          // Sockets — only loaded for driver & live pages
          if (id.includes('node_modules/socket.io-client/') ||
              id.includes('node_modules/engine.io-client/')) {
            return 'socket';
          }
          // Date utilities
          if (id.includes('node_modules/date-fns/')) {
            return 'date-fns';
          }
          // Everything else in node_modules → vendor chunk
          if (id.includes('node_modules/')) {
            return 'vendor';
          }
        },
        // ── Asset naming for long-term cache headers ─────────────────────
        entryFileNames:  'assets/[name]-[hash].js',
        chunkFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash][extname]',
      },
    },
  },

  // ── Dev server with proxy ──────────────────────────────────────────────
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', () => {
            console.error('\n❌ Backend not running — cd server && npm run dev\n');
          });
        },
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})
