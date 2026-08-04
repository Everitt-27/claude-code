import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const serverTarget = process.env.CT_SERVER_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@corrigible/api-schema": fileURLToPath(
        new URL("../../packages/api-schema/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // The browser talks to the API through the dev server, so there is one
    // origin in development and no CORS surprises in the Playwright run.
    proxy: {
      "/api": { target: serverTarget, changeOrigin: true, ws: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
