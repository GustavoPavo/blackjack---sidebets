/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  test: { environment: 'jsdom', globals: false, setupFiles: ['./test/setup.ts'], testTimeout: 15000 },
});
