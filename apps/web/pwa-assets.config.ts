import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates favicon, PWA and Apple touch icons from public/icon.svg:
//   npx pwa-assets-generator
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#b4461f' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#b4461f' } },
  },
  images: ['public/icon.svg'],
})
