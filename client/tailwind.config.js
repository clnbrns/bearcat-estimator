/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Bearcat brand palette — synced with bearcatturf.com
        brand: {
          green:     '#1b3d24',  // primary (hunter green)
          action:    '#1fa84c',  // bright "go" green for CTAs
          orange:    '#c85c18',  // accent / selection
          cream:     '#f5f0e8',  // warm off-white for cards
          sage:      '#8ab898',  // softer green for tags/buttons
          sageMuted: '#c2d4c8',  // border / subtle bg
        },

        // Backwards-compat aliases for existing components
        hunter:    '#1b3d24',
        burnt:     '#c85c18',
        offwhite:  '#f5f0e8',
        sage:      '#8ab898',
        sageMuted: '#c2d4c8',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI',
               'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
