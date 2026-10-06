/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Dark mode is opt-in via a class (none yet); 'media' crashes NativeWind on
  // web when the page's color scheme changes.
  darkMode: 'class',
  theme: {
    extend: {
      // Warm parchment theme, converted from the web app's OKLCH palette
      colors: {
        background: '#f8f5ef',
        foreground: '#1e130e',
        card: { DEFAULT: '#fefbf8', foreground: '#1e130e' },
        primary: { DEFAULT: '#a8372a', foreground: '#faf8f5' },
        secondary: { DEFAULT: '#f0eae0', foreground: '#3a2a20' },
        muted: { DEFAULT: '#efebe4', foreground: '#6d6059' },
        accent: { DEFAULT: '#ecdcc1', foreground: '#2d1d14' },
        destructive: '#e7000b',
        border: '#ded6c9',
        input: '#e3ddd3',
        ring: '#a8372a',
        game: { gold: '#edb417', 'gold-foreground': '#331b06', red: '#e62b34', green: '#31aa40', purple: '#864ad2' },
      },
      borderRadius: { sm: '8px', md: '10px', lg: '12px', xl: '16px', '2xl': '20px' },
    },
  },
  plugins: [],
}
