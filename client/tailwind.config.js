/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        'sidebar-bg': 'rgb(var(--color-sidebar) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          2: 'rgb(var(--color-ink-2) / <alpha-value>)',
          3: 'rgb(var(--color-ink-3) / <alpha-value>)',
          4: 'rgb(var(--color-ink-4) / <alpha-value>)',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        blue: {
          DEFAULT: '#6EC1FF',
          mid: '#4AABF5',
          dark: '#1A8EE0',
          faint: 'rgba(110,193,255,0.10)',
          faint2: 'rgba(110,193,255,0.06)',
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
        sans: ['General Sans', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
        sm: '12px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-md': 'var(--shadow-card-md)',
      },
      width: {
        sidebar: '224px',
        'right-panel': '288px',
      },
      minWidth: {
        sidebar: '224px',
        'right-panel': '288px',
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        wave: 'wave 0.8s ease-in-out infinite',
        'pulse-green': 'pulse-green 2s ease-in-out infinite',
        'pulse-blue': 'pulse-blue 1.2s ease-in-out infinite',
        'typing-bounce': 'typingBounce 1.2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(0.4)' },
        },
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 0 3px rgba(52,199,89,0.15)' },
          '50%': { boxShadow: '0 0 0 5px rgba(52,199,89,0.25)' },
        },
        'pulse-blue': {
          '0%, 100%': { boxShadow: '0 0 0 3px rgba(110,193,255,0.2)' },
          '50%': { boxShadow: '0 0 0 6px rgba(110,193,255,0.35)' },
        },
        typingBounce: {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-5px)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
