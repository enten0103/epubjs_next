# epubjs-next

A small Vite+ reader playground with browser-based tests.

## Scroll split reader

`createReader({ provider, book, root, render: "scrollSpilt" })` selects the scroll split render, auto-detects the EPUB service worker, registers the current book by `EpubBook.id`, and mounts a same-sized iframe into `root`. `prefix` is now optional: when omitted, the reader uses the intercept prefix injected by the Vite plugin.

```ts
import { createReader } from "epubjs-next";

const reader = createReader({
  provider,
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

`prefix` only defines the request namespace intercepted by the service worker so normal application requests are left alone; it is not used to distinguish books. Book identity comes from `EpubBook.id`.

`EpubLocation.html` is the spine item's href. `indexs` is a 1-based element path inside that XHTML document, and it may be omitted (or left empty) to mean the document root, i.e. the same navigation semantic as `[0]`.

## Drawer API

`createDrawer(book)` returns a drawer function that accepts a root element and an XHTML href. Each call recreates the iframe under that root and renders the requested XHTML into the new iframe.

`createDrawer` resolves the XHTML by requesting `book.resources.prefix + href`, so the book must already have a render prefix configured (for example through the service-worker reader flow, or by setting `book.resources.prefix` yourself).

```ts
import { createDrawer } from "epubjs-next";

const drawer = createDrawer(book);
await drawer(document.getElementById("reader")!, "OEBPS/Text/chapter1.xhtml");
```
