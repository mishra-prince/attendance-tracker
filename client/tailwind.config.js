/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#0A0908',
        carbon: '#1C1B1E',
        signal: '#FF453A',
        ember: '#B31217',
        bone: '#F5F1EE',
        ash: '#9C9793',
        muted: '#6B6663',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
