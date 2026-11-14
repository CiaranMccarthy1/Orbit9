/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,html}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-28px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        tap: {
          '0%, 55%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '70%': { transform: 'translate(-2px, -2px) scale(0.86)' },
        },
        'pin-drop': {
          '0%': { opacity: '0', transform: 'translateY(-18px)' },
          '12%': { opacity: '1', transform: 'translateY(0)' },
          '85%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        tap: 'tap 2.4s ease-in-out infinite',
        'pin-drop': 'pin-drop 4.5s ease-in infinite both',
      },
    },
  },
  plugins: [],
};
