import type { Config } from 'tailwindcss'

// Thème Ridewiz — charte « Signature ».
// Les échelles slate/green/amber/red/blue sont remappées sur les neutres chauds
// et les états sémantiques de la charte : tout le produit (dashboard, pages
// client, admin) se rhabille sans réécrire chaque classe.
export default <Partial<Config>>{
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['DM Serif Display', 'Georgia', 'serif'],
        grotesk: ['Space Grotesk', 'DM Sans', 'sans-serif'],
      },
      colors: {
        // Cuivre — accent & actions (#B5793F, survol #9C6431)
        brand: {
          50: '#FAF4EA',
          100: '#F4E7D2',
          200: '#E9D2AC',
          300: '#DBB683',
          400: '#CB985D',
          500: '#C4854A',
          600: '#B5793F',
          700: '#9C6431',
          800: '#7E5027',
          900: '#653F1F',
        },
        gold: '#E0B579',
        night: '#0E1B2C',
        // Neutres chauds (surface #FBF7F0, crème/diviseurs #F1EADB, bordures
        // #EFE7D8/#E4DCCC, libellés #9A8B72, texte doux #6C7889, fort #16283D)
        slate: {
          50: '#FBF7F0',
          100: '#F1EADB',
          200: '#EFE7D8',
          300: '#E4DCCC',
          400: '#9A8B72',
          500: '#6C7889',
          600: '#5B6879',
          700: '#3C4A5A',
          800: '#22334A',
          900: '#16283D',
          950: '#0E1B2C',
        },
        // Confirmé
        green: {
          50: '#EFF6F1',
          100: '#E4F1EA',
          200: '#C4E0D0',
          300: '#9CCBB1',
          600: '#2E7D5B',
          700: '#276C4E',
          800: '#22593F',
          900: '#1B4732',
        },
        // En attente
        amber: {
          50: '#FAF3E0',
          100: '#F6ECD6',
          200: '#EDDBB2',
          300: '#E2C583',
          400: '#C08A2E',
          500: '#C08A2E',
          600: '#A87823',
          700: '#96691E',
          800: '#96691E',
          900: '#7A5518',
        },
        // Annulé
        red: {
          50: '#F9F0F0',
          100: '#F4E1E1',
          200: '#E9C9C9',
          300: '#D89A9A',
          400: '#C96A6A',
          500: '#B23A3A',
          600: '#B23A3A',
          700: '#9C3030',
          800: '#822828',
        },
        // Payé
        blue: {
          50: '#EFF5FA',
          100: '#E3EDF6',
          200: '#C7DCEE',
          700: '#2F6FB0',
          800: '#2A639E',
        },
        // Bandeau admin « en tant que » (famille Payé)
        indigo: {
          50: '#EFF5FA',
          100: '#E3EDF6',
          200: '#C7DCEE',
          300: '#9FC2E0',
          700: '#2F6FB0',
          900: '#1E4E7E',
        },
      },
    },
  },
  plugins: [],
}
