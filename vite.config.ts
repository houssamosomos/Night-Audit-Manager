import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Electron loads the app via relative paths, so base must be './'
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
});
