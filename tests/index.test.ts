import { describe, it } from "vite-plus/test";
import { createFileProviderFromPicker } from "../src/provider/index.ts";
import { createEpubServer } from "../src/provider/server.ts";
import { createReader } from "../src/index.ts";

describe("index test", () => {
  it("reader", () => {
    document.body.innerHTML = `<html><body><button id='button'>click to chose a file</button><div id='reader'></div></body></html>`;
    const btn = document.getElementById("button");
    btn?.addEventListener("click", async () => {
      const provider = await createFileProviderFromPicker();
      //安全策略影响，导致注册的provider必须在此目录下，仅测试生效
      await createEpubServer(provider, {
        prefix: "/src/provider/epub-test", // must match the reader prefix
        swUrl: "../src/provider/epub-sw.ts",
        scope: "/src/provider/",
      });
      const reader = createReader("/src/provider/epub-test");
      reader.mount("reader");
      setTimeout(() => {
        reader.setSrc("OEBPS/Text/chapter0000.xhtml");
      }, 2000);
    });
  });
});
