import { defineConfig } from 'vite';

// GitHub Pages pubblica il sito in https://4nso.github.io/physics-playground/
export default defineConfig({
  base: '/physics-playground/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 6000, // Rapier include il motore fisico (WASM) dentro il JS
  },
});
