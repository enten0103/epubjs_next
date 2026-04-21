import { defineConfig } from "vite-plus";

import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  staged: {
    "/src/*.{js,ts,tsx,vue}": "vp check --fix",
  },
  pack: {
    dts: {
      tsgo: true,
    },
    entry: {
      index: "src/index.ts",
    },
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
      viewport: { width: 1920, height: 1080 },
      enabled: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
  },
});
