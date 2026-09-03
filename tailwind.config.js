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
          bg: '#FAFAF8',
          surface: '#FFFFFF',
          line: '#E8E6E0',
          'line-strong': '#D3D1C7',
          text: '#2C2C2A',
          'text-2': '#5F5E5A',
          'text-3': '#888780',
        },
      },
    },
  },
  plugins: [],
}
