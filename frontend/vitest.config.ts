import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Disable the on-disk module transform cache: vitest 5.0.5 reads cached
    // modules as a Buffer, which crashes vite 8.3.5's source-map lookup on
    // Node 24 ("code.charCodeAt is not a function", vitest-dev/vitest#11682).
    fsModuleCache: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/'],
    },
  },
});
