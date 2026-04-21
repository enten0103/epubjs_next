# epubjs-next

A small Vite+ reader playground with browser-based tests.

## Drawer reader

`createReader({ provider, book, root, render: "drawer" })` creates a reader backed by a stable `paper` iframe. `drawer` preprocesses EPUB XHTML/CSS/assets, rewrites dependent resources to `blob:` URLs, renders the XHTML into the iframe with `srcdoc`, and lets the injected runtime handle pagination and location updates.

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

`paper.mode` supports both `"scroll"` and `"paginated"`, but `paper` itself only owns display state. Use `getCurrentLocation(paper)` to read the current location. The active reading state is encoded into the paper iframe URL query params, and drawer diff logic decides whether a target location becomes a full rerender, a scroll update, or a JS pagination page flip. `EpubLocation.html` is the spine item's href. `fragment` targets an element id inside that XHTML document, `indexs` is a 1-based element path, and `position` describes the current paper offset as either a vertical scroll position or a paginated page index.

## Paper API

`createPaper(root, { mode })` creates the stable iframe container used by the reader. It only owns iframe lifecycle, display mode, and document rendering.

## Drawer API

`createDrawer(book, provider)` returns a drawer function that accepts a `paper` instance and a target `EpubLocation`. Each call diffs the target location, decides whether the iframe needs a fresh `blob:` document render, and then positions the rendered result to that location.

```ts
import { createDrawer, createPaper } from "epubjs-next";
import { createFileProviderFromBlob } from "epubjs-next/provider";

const provider = await createFileProviderFromBlob(file);
const paper = createPaper(document.getElementById("reader")!, {
  mode: "scroll",
});
const drawer = createDrawer(book, provider);
await drawer(paper, {
  html: "OEBPS/Text/chapter1.xhtml",
  fragment: "section-2",
});
```
