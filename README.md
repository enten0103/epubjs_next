# epubjs-next

A small Vite+ reader playground with browser-based tests.

## Scroll split reader

`createReader({ prefix, root, book, render: "scrollSpilt" })` selects the scroll split render, mounts a same-sized iframe into `root`, scrolls each spine XHTML inside that iframe, and keeps both the render context and controller on the returned reader object.

```ts
import { createReader } from "epubjs-next";

const reader = createReader({
  prefix: "/books/demo",
  root: document.getElementById("reader")!,
  book,
  render: "scrollSpilt",
});

await reader.context.ready;
await reader.controller.next();
await reader.controller.setLocation({
  html: "OEBPS/Text/chapter1.xhtml",
  indexs: [1, 2, 1],
});
```

`EpubLocation.html` is the spine item's href. `indexs` is a 1-based element path inside that XHTML document, and it may be omitted (or left empty) to mean the document root, i.e. the same navigation semantic as `[0]`.
