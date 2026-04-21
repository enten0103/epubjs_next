import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "epubjs-next/provider": resolve(__dirname, "../src/provider/index.ts"),
      "epubjs-next/parser": resolve(__dirname, "../src/parser/index.ts"),
      "epubjs-next": resolve(__dirname, "../src/index.ts"),
    },
  },
});
