import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Dev server proxies `/api` (REST + SSE) to the backend so the browser talks to a
// single origin — no CORS in dev, and SSE streams through untouched.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.BACKEND_ORIGIN ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
