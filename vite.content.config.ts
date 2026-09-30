import { resolve } from "node:path";
import { defineConfig } from "vite";

// The content script must be a single self-contained classic script.
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: false,
    sourcemap: mode === "development" ? "inline" : false,
    minify: mode !== "development",
    lib: {
      entry: resolve(import.meta.dirname, "src/content/content.ts"),
      formats: ["iife"],
      name: "LekseisHover",
      fileName: () => "content.js",
    },
  },
}));
