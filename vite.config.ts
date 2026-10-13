import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  publicDir: false,
  build: { outDir: "dist/public", emptyOutDir: true },
  server: { strictPort: true, proxy: { "/api": "http://127.0.0.1:8788" } },
});
