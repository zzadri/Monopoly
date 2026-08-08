import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // l'API de dev écoute sur 3100 (le 3000 est réservé au conteneur Docker)
      '/api': 'http://localhost:3100',
      '/socket.io': { target: 'http://localhost:3100', ws: true },
    },
  },
});
