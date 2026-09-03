/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      colors: {
        ink: {
          bg: 'rgb(var(--ink-bg) / <alpha-value>)',
          surface: 'rgb(var(--ink-surface) / <alpha-value>)',
          line: 'rgb(var(--ink-line) / <alpha-value>)',
          'line-strong': 'rgb(var(--ink-line-strong) / <alpha-value>)',
          text: 'rgb(var(--ink-text) / <alpha-value>)',
          'text-2': 'rgb(var(--ink-text-2) / <alpha-value>)',
          'text-3': 'rgb(var(--ink-text-3) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
