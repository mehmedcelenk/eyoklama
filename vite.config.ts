import { defineConfig } from 'vite';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src/app'),
      '@features': path.resolve(__dirname, './src/features'),
      '@data': path.resolve(__dirname, './src/data'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@styles': path.resolve(__dirname, './src/styles')
    }
  },
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        entryFileNames: 'app.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'style.css';
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'eYoklama V3',
        short_name: 'eYoklama',
        description: 'Yoklama. Gerektiği kadar.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,json}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Do NOT cache live Supabase RPC database calls in service worker cache
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
});
