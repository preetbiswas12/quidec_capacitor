/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1B3C53',
        secondary: '#234C6A',
        tertiary: '#456882',
        'text-primary': '#E3E3E3',
        'bg-dark': '#0a0a14',
        'bg-secondary': '#111122',
        'bg-tertiary': '#1a1a2e',
        'danger': '#5c2e2e',
        'grayblue': '#4a6fa5',
      },
    },
  },
  plugins: [],
}
