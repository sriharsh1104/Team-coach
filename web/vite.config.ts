import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same Nest API as mobile — CORS_ORIGIN=* in backend .env.development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
