import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { fs: { allow: ['..'] } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
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
