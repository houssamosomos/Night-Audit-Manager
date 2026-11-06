/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef2f7', 100: '#d6deeb', 200: '#aebfd6',
          300: '#7f99bd', 400: '#53719f', 500: '#375186',
          600: '#28406e', 700: '#1d3156', 800: '#152442',
          900: '#0d1a33', 950: '#071126',
        },
        turquoise: {
          50: '#e6fbfa', 100: '#c2f5f2', 200: '#8cebe6',
          300: '#4fdcd5', 400: '#22c6bf', 500: '#0ea7a1',
          600: '#0a8581', 700: '#0c6a68', 800: '#0f5553',
          900: '#114746', 950: '#042a2a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Cairo', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 10px rgba(7, 17, 38, 0.08)',
        cardDark: '0 2px 14px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};
