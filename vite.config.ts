import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(() => {
  // GitHub Pages serves the site from /<repo-name>/ : the workflow sets VITE_BASE_PATH=/MrWaterBeverages/.
  // Everywhere else (server.ts, Android, iOS) the app lives at the root.
  const rawBase = process.env.VITE_BASE_PATH || '/';
  const base = rawBase.endsWith('/') ? rawBase : rawBase + '/';
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt', // never reload the page on its own; the user taps "Update" when ready
        injectRegister: null,
        workbox: {
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          name: 'MrWater Ledger',
          short_name: 'MrWater',
          description: 'Comprehensive water distribution ledger and billing system',
          theme_color: '#1a3354',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
