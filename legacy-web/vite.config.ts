import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Adds a Content-Security-Policy to the built index.html. Only our own
 * scripts may run, and the page may only talk to itself and the API, so even
 * an injected script couldn't load code or send the session token elsewhere.
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
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
      },
    },
  },
}))
