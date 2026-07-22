/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Yellow Emperor Kitting — standalone, import-driven PWA.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"],
      workbox: {
        // App is offline-capable; formula OCR/PDF assets are large so cache generously.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
      manifest: {
        name: "Yellow Emperor Kitting",
        short_name: "YE Kitting",
        description: "Import-driven material & packaging kitting for Yellow Emperor.",
        theme_color: "#0b6b3a",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
