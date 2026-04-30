/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        hunter: '#1b3d24',
        burnt: '#c85c18',
        offwhite: '#f5f0e8',
        sage: '#8ab898',
        sageMuted: '#c2d4c8',
      },
      fontFamily: {
        sans: ['system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
