/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        workbench: {
          bg: '#0e1117',
          sidebar: '#161922',
          card: '#1e222d',
          hover: '#262b38',
          border: '#2a303f',
          text: '#e2e8f0',
          muted: '#94a3b8'
        }
      }
    },
  },
  plugins: [],
}
