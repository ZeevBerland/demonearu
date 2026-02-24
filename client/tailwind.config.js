/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a0f',
          1: '#12121a',
          2: '#1a1a26',
          3: '#222233',
        },
        accent: {
          DEFAULT: '#6366f1',
          light: '#818cf8',
        },
        emotion: {
          neutral: '#94a3b8',
          calm: '#38bdf8',
          happy: '#fbbf24',
          sad: '#60a5fa',
          angry: '#f87171',
          fearful: '#c084fc',
          disgust: '#34d399',
          surprised: '#f472b6',
          contempt: '#fb923c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
