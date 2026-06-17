import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    proxy: {
      // Dev convenience: proxy PocketBase so the browser and SSR hit the same origin.
      '/api': 'http://127.0.0.1:8090',
      '/_': 'http://127.0.0.1:8090'
    }
  }
});
