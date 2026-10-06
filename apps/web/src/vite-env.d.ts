/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server base URL, e.g. https://munchkin-api.onrender.com. Empty: same origin (dev proxy). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
