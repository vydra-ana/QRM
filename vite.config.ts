import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// PWA: pro produkční build inspektora spusťte `npm run build:inspector`
// Service worker se registruje přes manifest v inspector-main (vite-plugin-pwa volitelně)

export default defineConfig(({ mode }) => {
  const isInspectorOnly = mode === 'inspector';

  const backendTarget = 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '^/(health|auth|departments|managers|criteria|audits|reports|uploads|admin|files|inspection-plans)': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
      proxy: {
        '^/(health|auth|departments|managers|criteria|audits|reports|uploads|admin|files|inspection-plans)': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: isInspectorOnly
      ? {
          outDir: 'dist-inspector',
          rollupOptions: {
            input: { inspector: resolve(__dirname, 'inspector.html') },
          },
        }
      : {
          rollupOptions: {
            input: {
              main: resolve(__dirname, 'index.html'),
              inspector: resolve(__dirname, 'inspector.html'),
            },
          },
        },
  };
});
