import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { epubServiceWorker } from "../src/vite-plugin.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [epubServiceWorker()],
  resolve: {
    alias: {
      "epubjs-next/provider/server": resolve(__dirname, "../src/provider/server.ts"),
      "epubjs-next/provider": resolve(__dirname, "../src/provider/index.ts"),
      "epubjs-next/parser": resolve(__dirname, "../src/parser/index.ts"),
      "epubjs-next": resolve(__dirname, "../src/index.ts"),
    },
  },
});
