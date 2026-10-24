import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/ws': { target: 'http://localhost:3001', ws: true },
    },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
