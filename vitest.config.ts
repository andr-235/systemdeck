import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    globals: true,
    exclude: ['node_modules/**', 'out/**', 'dist/**', 'coverage/**'],
    coverage: {
      provider: 'v8',
      exclude: ['out/**', 'dist/**', 'coverage/**', 'node_modules/**', '**/*.d.ts', 'scripts/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/main/**/*.{test,spec}.{ts,tsx}',
            'src/shared/**/*.{test,spec}.{ts,tsx}',
            'src/preload/**/*.{test,spec}.{ts,tsx}',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['./src/renderer/src/test-setup.ts'],
        },
      },
    ],
  },
});
