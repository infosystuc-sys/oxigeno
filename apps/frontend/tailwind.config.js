/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        primary: {
          50:  '#e8eef8',
          100: '#c5d4ef',
          200: '#9ab6e0',
          600: '#083A82',
          700: '#062d65',
          800: '#051f48',
        },
        ink: {
          DEFAULT: '#1A2331',
          muted:   '#5A6676',
          subtle:  '#8A96A3',
        },
        rim: {
          DEFAULT: '#D8DEE5',
          light:   '#EEF1F5',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          subtle:  '#F5F7FA',
        },
        ok: {
          DEFAULT: '#1F6E43',
          dark:    '#175534',
          subtle:  '#EAF4EE',
          muted:   '#A8D5B8',
        },
        warn: {
          DEFAULT: '#8A5A00',
          subtle:  '#FEF6E7',
          muted:   '#E8C97A',
        },
        fail: {
          DEFAULT: '#A32020',
          dark:    '#7a1818',
          subtle:  '#FDEAEA',
          muted:   '#F0AAAA',
        },
      },
    },
  },
  plugins: [],
};
