import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      '/health': 'http://localhost:8000',
      '/targets': 'http://localhost:8000',
      '/frames': 'http://localhost:8000',
      '/render': 'http://localhost:8000',
      '/combine': 'http://localhost:8000',
      '/rgb': 'http://localhost:8000',
      '/photometry': 'http://localhost:8000',
      '/flags': 'http://localhost:8000',
      '/register': 'http://localhost:8000',
      '/login': 'http://localhost:8000',
      '/me': 'http://localhost:8000',
      '/logout': 'http://localhost:8000',
      '/discoveries': 'http://localhost:8000',
      '/storage': 'http://localhost:8000',
    },
  },
});
