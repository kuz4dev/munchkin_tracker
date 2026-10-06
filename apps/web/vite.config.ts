import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const THEME_COLOR = '#fbf1e4'

/**
 * Adds a Content-Security-Policy to the built index.html. Only our own
 * scripts run, and the page talks only to itself and the API, so even an
 * injected script couldn't load code or send the session token elsewhere.
 * (frame-ancestors can't be set from a meta tag: see public/_headers.)
 */
function contentSecurityPolicy(apiUrl: string | undefined): Plugin {
  const connect = ["'self'"]
  if (apiUrl) {
    const api = new URL(apiUrl)
    connect.push(api.origin, `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}`)
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // UI components position popovers with inline styles
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    // Small font subsets would be inlined as data: URLs, which the CSP
    // (font-src 'self') blocks; keep every font a separate, cacheable file.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL),
    VitePWA({
      // Ask before reloading: an update shouldn't interrupt a game
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'Манчкин Трекер',
        short_name: 'Манчкин',
        description: 'Трекер уровней для настольной игры Манчкин в реальном времени',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: THEME_COLOR,
        theme_color: THEME_COLOR,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell works offline; game data always comes live from the server
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        cleanupOutdatedCaches: true,
        // Fonts come in many subsets; cache only the ones the browser actually loads
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // The Go server (server/) in development
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'http://localhost:8080', ws: true },
    },
  },
}))
