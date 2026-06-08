import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@setrox/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@setrox/shared/types': path.resolve(__dirname, '../../packages/shared/src/types/index.ts'),
      '@setrox/shared/schemas': path.resolve(__dirname, '../../packages/shared/src/schemas/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/v1': {
        target: process.env.VITE_API_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
