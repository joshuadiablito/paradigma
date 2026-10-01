import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds the extension pages and the service worker as ES modules.
// The content script is built separately (vite.content.config.ts) because
// Chrome loads content scripts as classic scripts, which cannot `import`.
export default defineConfig(({ mode }) => ({
  root: "src",
  publicDir: resolve(import.meta.dirname, "public"),
  base: "",
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: false,
    sourcemap: mode === "development" ? "inline" : false,
    minify: mode !== "development",
    rollupOptions: {
      input: {
        options: resolve(import.meta.dirname, "src/options/options.html"),
        action: resolve(import.meta.dirname, "src/action/action.html"),
        offscreen: resolve(import.meta.dirname, "src/offscreen/offscreen.html"),
        "service-worker": resolve(import.meta.dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
}));
