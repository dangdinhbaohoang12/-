import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    // `npm run dev` only serves the Vite frontend; api/ptw.ts is a Vercel
    // serverless function and is never invoked by Vite's dev server. Proxy
    // /api to a locally running function host (e.g. `vercel dev`, default
    // port 3000) so hydration/login work without a separate documented
    // step. Override with PTW_API_PROXY_TARGET if that host runs elsewhere.
    proxy: {
      '/api': {
        target: process.env.PTW_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'],
    passWithNoTests: false,
  },
});
