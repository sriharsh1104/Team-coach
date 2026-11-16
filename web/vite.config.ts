import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same Nest API as mobile — CORS_ORIGIN=* in backend .env.development.
//
// Also the frontend for the Tauri desktop app (web/src-tauri). `tauri dev`
// sets TAURI_ENV_* so we can tune the dev server + build target for the
// native webview (WebKitGTK on Linux, WebView2 on Windows).
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [react()],
  // Tauri prints its own logs; don't wipe them on every rebuild.
  clearScreen: false,
  // Expose TAURI_ENV_* to the app (e.g. import.meta.env.TAURI_ENV_PLATFORM).
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    port: 5173,
    // Tauri expects this exact port — fail instead of picking another one.
    strictPort: true,
    host: true,
    watch: {
      // Don't let Cargo output trigger Vite rebuilds.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // WebView2 is Chromium; WebKitGTK/macOS WebKit need the Safari target.
    target: isTauri
      ? process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : 'safari13'
      : 'modules',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
