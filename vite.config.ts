import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        banner: path.resolve(__dirname, 'banner.html'),
      },
    },
  },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/testSetup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
