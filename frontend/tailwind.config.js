/**
 * Tailwind v4 config.
 * Keyframes and animations are intentionally NOT defined here; they live in
 * src/styles.css under @theme, which is what makes variants such as
 * `motion-safe:animate-teacher-bob` work. Add new ones there, not in this file.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,html}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
