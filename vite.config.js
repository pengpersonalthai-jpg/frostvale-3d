import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site also works when hosted from a
  // sub-path (e.g. GitHub Pages) without extra configuration.
  base: './',
  build: {
    // Three.js is large; silence the default 500 kB chunk warning since a
    // single vendored chunk is fine for a game-like app loaded once.
    chunkSizeWarningLimit: 1200,
  },
});
