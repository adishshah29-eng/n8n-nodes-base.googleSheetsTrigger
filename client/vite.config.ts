import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // content/ holds scenarios, audio, models and AR targets; serving it as the public dir
  // ships them with the build so the service worker can precache them.
  publicDir: '../content',
  server: { fs: { allow: ['..'] } },
  plugins: [
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
        icons: [],
      },
    }),
  ],
});
