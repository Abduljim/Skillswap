/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f5f6f8',
          100: '#e9ebef',
          200: '#cdd1da',
          300: '#a5abba',
          400: '#76819a',
          500: '#586278',
          600: '#444c5f',
          700: '#363b4a',
          800: '#252a35',
          900: '#171a23',
          950: '#0d0f15',
        },
        cream: {
          50: '#fdfaf4',
          100: '#faf2e3',
          200: '#f3e5c8',
          300: '#ecd29e',
          400: '#e0b86f',
          500: '#d8a14a',
        },
        coral: {
          50: '#fff5f1',
          100: '#ffe6db',
          200: '#ffcab3',
          300: '#ffa07e',
          400: '#ff6f47',
          500: '#fb4f1d',
          600: '#e23a0d',
          700: '#bd2c0c',
          800: '#972612',
          900: '#7a2311',
        },
        mint: {
          50: '#effaf4',
          100: '#d8f1e3',
          200: '#b3e1c8',
          300: '#82cba6',
          400: '#54b184',
          500: '#35976b',
          600: '#287a56',
          700: '#226147',
          800: '#1e4e3b',
          900: '#1a4031',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft-sm': '0 1px 2px rgba(13,15,21,0.04), 0 2px 4px rgba(13,15,21,0.06)',
        soft: '0 2px 6px rgba(13,15,21,0.06), 0 8px 20px rgba(13,15,21,0.06)',
        'soft-lg': '0 4px 12px rgba(13,15,21,0.07), 0 20px 40px rgba(13,15,21,0.08)',
        'glow-coral': '0 0 0 4px rgba(251,79,29,0.12), 0 8px 24px rgba(251,79,29,0.18)',
        'glow-mint': '0 0 0 4px rgba(53,151,107,0.12), 0 8px 24px rgba(53,151,107,0.18)',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'count-up': 'count-up 0.8s ease-out',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
        'count-up': {
          '0%': { transform: 'translateY(8px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};