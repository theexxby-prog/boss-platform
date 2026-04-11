/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy:  { DEFAULT: '#0F1923', 50: '#1A2B3C', 100: '#0F1923' },
        boss:  { DEFAULT: '#2E5FA3', light: '#4A7FC1', dark: '#1A3D6E' },
        teal:  { DEFAULT: '#0D6B72', light: '#12919A' },
        green: { DEFAULT: '#1A6B3A', light: '#22A05A' },
        slate: { 800: '#1E293B', 700: '#334155', 600: '#475569', 400: '#94A3B8', 200: '#E2E8F0' },
      },
      fontFamily: {
        display: ['"DM Mono"', 'monospace'],
        body:    ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
