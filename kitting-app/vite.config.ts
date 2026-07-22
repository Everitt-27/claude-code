/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two build modes:
//  - default: installable PWA (multi-chunk, service worker) for local/hosted deploy
//  - `--mode artifact`: one self-contained HTML file for the claude.ai sandbox
//    (no external requests: pdf.js runs on the main thread, on-device OCR is
//    disabled, no service worker).
export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  return {
    base: "./",
    define: {
      __ARTIFACT__: JSON.stringify(artifact),
    },
    resolve: artifact
      ? { alias: { "virtual:pwa-register": "/src/pwaStub.ts" } }
      : {},
    plugins: artifact
      ? [react(), viteSingleFile()]
      : [
          react(),
          VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"],
            workbox: {
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
  };
});
