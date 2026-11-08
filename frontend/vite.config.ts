import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API proxy is shared by the dev server and `vite preview` (used by the
// Playwright webServer, see playwright.config.ts) so the E2E frontend can
// reach the backend on :3000 exactly like the dev server.
const apiProxy = {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  build: { outDir: 'dist', sourcemap: true },
});
