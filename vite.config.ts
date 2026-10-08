import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // Worker de pdf.js publié en .js (et non .mjs) : servi partout comme du JavaScript.
      output: { assetFileNames: (a) => (/\.mjs$/.test(a.names?.[0] ?? '') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') },
    },
  },
});
