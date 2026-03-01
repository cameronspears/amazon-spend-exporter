import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4173"
    }
  },
  build: {
    outDir: path.resolve(rootDir, "dist"),
    emptyOutDir: true
  }
});
