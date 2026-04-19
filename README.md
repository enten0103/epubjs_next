# epubjs-next

A small Vite+ reader playground with browser-based tests.

## Drawer reader

`createReader({ provider, book, root, render: "drawer" })` creates a reader backed by a stable `paper` iframe. `drawer` is responsible for rendering EPUB XHTML into that paper, while pagination and location logic run inside the iframe through an injected runtime script. `prefix` is optional when `provider` is supplied: the reader will use the intercept prefix injected by the Vite plugin.

```ts
import { createReader } from "epubjs-next";

const reader = createReader({
  provider,
  root: document.getElementById("reader")!,
  book,
  render: "drawer",
  paper: {
    mode: "paginated",
  },
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
  fragment: "section-2",
});
```

`prefix` only defines the request namespace intercepted by the service worker so normal application requests are left alone; it is not used to distinguish books. Book identity comes from `EpubBook.id`.

`paper.mode` supports both `"scroll"` and `"paginated"`, but `paper` itself only owns display state. Use `getCurrentLocation(paper)` to read the current location. The active reading state is encoded into the paper iframe URL query params, and drawer diff logic decides whether a target location becomes a full rerender, a scroll update, or a JS pagination page flip. `EpubLocation.html` is the spine item's href. `fragment` targets an element id inside that XHTML document, `indexs` is a 1-based element path, and `position` describes the current paper offset as either a vertical scroll position or a paginated page index.

## Paper API

`createPaper(root, { mode })` creates the stable iframe container used by the reader. It only owns iframe lifecycle, display mode, and document rendering.

## Drawer API

`createDrawer(book)` returns a drawer function that accepts a `paper` instance and a target `EpubLocation`. Each call navigates the existing paper iframe to the requested XHTML document and then positions the rendered result to that location.

`createDrawer` resolves XHTML through `book.resources.prefix`, so the book must already have a render prefix configured (for example through the service-worker reader flow, or by setting `book.resources.prefix` yourself).

```ts
import { createDrawer, createPaper } from "epubjs-next";

const paper = createPaper(document.getElementById("reader")!, {
  mode: "scroll",
});
const drawer = createDrawer(book);
await drawer(paper, {
  html: "OEBPS/Text/chapter1.xhtml",
  fragment: "section-2",
});
```
