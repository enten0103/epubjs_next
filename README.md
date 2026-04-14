# epubjs-next

A small Vite+ reader playground with browser-based tests.

## Scroll split reader

`createReader({ prefix, root, book, render: "scrollSpilt" })` selects the scroll split render, mounts a same-sized iframe into `root`, scrolls each spine XHTML inside that iframe, and returns a direct controller object.

```ts
import { createReader } from "epubjs-next";

const reader = createReader({
  prefix: "/books/demo",
  root: document.getElementById("reader")!,
  book,
  render: "scrollSpilt",
  events: {
    onDocumentChange({ document, href, spineIndex }) {
      console.log("loaded", href, spineIndex, document.title);
    },
  },
});

await reader.ready;
await reader.next();
await reader.setLocation({
  html: "OEBPS/Text/chapter1.xhtml",
  indexs: [1, 2, 1],
});
```

`EpubLocation.html` is the spine item's href. `indexs` is a 1-based element path inside that XHTML document, and it may be omitted (or left empty) to mean the document root, i.e. the same navigation semantic as `[0]`.
