import { describe, it } from "vite-plus/test";
import { createFileProviderFromPicker } from "../src/provider/index.ts";
import { createEpubServiceWorker } from "../src/provider/server.ts";
import { createReader } from "../src/index.ts";
import { parseEpub3 } from "../src/parser/index.ts";

describe("index test", () => {
  it("reader", () => {
    document.body.innerHTML = `<html><body><button id='button'>click to chose a file</button><div id='reader'></div></body></html>`;
    const btn = document.getElementById("button");
    btn?.addEventListener("click", async () => {
      const provider = await createFileProviderFromPicker();
      //安全策略影响，导致注册的provider必须在此目录下，仅测试生效
      const sw = await createEpubServiceWorker({
        swUrl: "../src/provider/epub-sw.ts",
        scope: "/src/provider/",
      });
      sw.addBook(provider, "/src/provider/epub-test");
      const reader = createReader("/src/provider/epub-test");
      const book = await parseEpub3(provider);
      console.log(book);
      reader.mount("reader");
      reader.setSrc("OEBPS/Text/chapter0000.xhtml");
    });
  });
});
