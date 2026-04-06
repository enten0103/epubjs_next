import { defineConfig } from "vite-plus";

import {webdriverio} from "vite-plus/test/browser-webdriverio"

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
    ui:true,
    browser: {
      headless: true,
      viewport: {width: 1920, height: 1080},
      enabled: true,
      instances: [{ browser: "chrome", }],
      provider:webdriverio()
     }
    }
});
