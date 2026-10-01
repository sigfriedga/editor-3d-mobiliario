import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  // Rutas relativas: funciona en GitHub Pages sea cual sea el nombre del repositorio.
  base: './',
  build: {
    // Three.js va en su propio fichero: cambia poco y el navegador lo cachea.
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
