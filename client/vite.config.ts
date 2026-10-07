import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // content/ holds scenarios, audio, models and AR targets; serving it as the public dir
  // ships them with the build so the service worker can precache them.
  publicDir: '../content',
  server: {
    fs: { allow: ['..'] },
    // `npm run dev:phone`: phones only allow the camera on https, so serve with a self-signed cert on the
    // LAN and forward /api to `vercel dev` (or API_URL).
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
  plugins: [
    ...(process.env.HTTPS ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // src/offline.ts registers, so the UI can tell when precaching is done
      workbox: {
        clientsClaim: true,
        // Precache scenarios, models, markers and audio so the app runs in airplane mode.
        globPatterns: ['**/*.{js,css,html,json,glb,mind,mp3,woff2,png,svg}'],
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: 'Aotan',
        short_name: 'Aotan',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
