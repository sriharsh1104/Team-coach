/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APK_URL?: string;
  // Desktop installer links shown on the home page (web/DESKTOP.md).
  readonly VITE_DESKTOP_LINUX_URL?: string;
  readonly VITE_DESKTOP_WINDOWS_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
