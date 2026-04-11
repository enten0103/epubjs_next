import { defineConfig } from "vite-plus";

import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    browser: {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      enabled: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
  },
});
