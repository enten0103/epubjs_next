import { createReader } from "epubjs-next";
import { createFileProviderFromBlob } from "epubjs-next/provider";
import { parseEpub3 } from "epubjs-next/parser";
import type { Reader } from "epubjs-next";
import type { TocItem } from "../../src/parser/types.ts";

const fileInput = document.getElementById("file-input") as HTMLInputElement;
const container = document.getElementById("container") as HTMLDivElement;
const status = document.getElementById("status") as HTMLSpanElement;
const bookInfo = document.getElementById("book-info") as HTMLDivElement;
const tocContainer = document.getElementById("toc-container") as HTMLDivElement;
const placeholder = document.getElementById("placeholder") as HTMLDivElement;
const prevXhtmlButton = document.getElementById("prev-xhtml") as HTMLButtonElement;
const nextXhtmlButton = document.getElementById("next-xhtml") as HTMLButtonElement;

let currentReader: Reader | null = null;

function updateXhtmlButtons() {
  if (!currentReader) {
    prevXhtmlButton.disabled = true;
    nextXhtmlButton.disabled = true;
    return;
  }

  const currentIndex = currentReader.getCurrentSpineIndex();
  prevXhtmlButton.disabled = currentIndex <= 0;
  nextXhtmlButton.disabled = currentIndex >= currentReader.book.spine.length - 1;
}

async function navigateBySpine(offset: -1 | 1) {
  if (!currentReader) {
    return;
  }

  const nextIndex = currentReader.getCurrentSpineIndex() + offset;
  const nextItem = currentReader.book.spine[nextIndex];
  if (!nextItem) {
    updateXhtmlButtons();
    return;
  }

  await currentReader.setLocation({
    html: nextItem.href,
  });
  updateXhtmlButtons();
}

prevXhtmlButton.addEventListener("click", () => {
  void navigateBySpine(-1);
});

nextXhtmlButton.addEventListener("click", () => {
  void navigateBySpine(1);
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  status.textContent = "Loading…";

  try {
    currentReader?.destroy();
    currentReader = null;
    updateXhtmlButtons();

    const provider = await createFileProviderFromBlob(file);
    const book = await parseEpub3(provider);

    // Display book metadata
    bookInfo.style.display = "block";
    bookInfo.innerHTML = `
      <p><strong>Title:</strong> ${escape(book.pkg.title ?? "Unknown")}</p>
      <p><strong>Author:</strong> ${escape(book.pkg.creator ?? "Unknown")}</p>
      <p><strong>Language:</strong> ${escape(book.pkg.language ?? "Unknown")}</p>
      <p><strong>Spine items:</strong> ${book.spine.length}</p>
    `;

    // Build TOC
    if (book.toc && book.toc.length > 0) {
      tocContainer.style.display = "block";
      tocContainer.innerHTML = "<h3>Table of Contents</h3>" + renderToc(book.toc);
      tocContainer.onclick = onTocClick;
    } else {
      tocContainer.style.display = "none";
      tocContainer.onclick = null;
    }

    // Show reader, hide placeholder
    container.style.display = "block";
    placeholder.style.display = "none";

    currentReader = createReader({
      root: container,
      provider,
      book,
      render: "scrollSpilt",
      events: {
        onDocumentChange() {
          updateXhtmlButtons();
        },
      },
    });
    await currentReader.ready;
    updateXhtmlButtons();

    status.textContent = "✓ Loaded";
  } catch (err) {
    status.textContent = `Error: ${(err as Error).message}`;
    console.error(err);
    updateXhtmlButtons();
  }
});

function getContentRoot(doc: Document): Element {
  return (
    doc.body ??
    Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "body") ??
    doc.documentElement
  );
}

function buildElementPath(root: Element, target: Element): number[] {
  const path: number[] = [];
  let current: Element | null = target;
  while (current && current !== root) {
    const ancestor: Element | null = current.parentElement;
    if (!ancestor) {
      return [];
    }
    const index = Array.from(ancestor.children).indexOf(current);
    if (index < 0) {
      return [];
    }
    path.unshift(index + 1);
    current = ancestor;
  }
  return current === root ? path : [];
}

async function navigateTo(href: string) {
  if (!currentReader) {
    return;
  }

  const [html, fragment] = href.split("#", 2);
  await currentReader.setLocation({
    html,
  });

  if (!fragment) {
    updateXhtmlButtons();
    return;
  }

  const doc = currentReader.getCurrentDocument();
  const target = doc?.getElementById(fragment);
  if (!doc || !target) {
    return;
  }

  await currentReader.setLocation({
    html,
    indexs: buildElementPath(getContentRoot(doc), target),
  });
  updateXhtmlButtons();
}

function onTocClick(e: Event) {
  const target = e.target as HTMLElement;
  if (target.tagName === "A" && target.dataset.href) {
    e.preventDefault();
    void navigateTo(target.dataset.href);
  }
}

function renderToc(items: TocItem[]): string {
  if (items.length === 0) return "";
  let html = "<ul>";
  for (const item of items) {
    html += "<li>";
    if (item.href) {
      html += `<a data-href="${escape(item.href)}">${escape(item.label)}</a>`;
    } else {
      html += `<span>${escape(item.label)}</span>`;
    }
    if (item.children.length > 0) {
      html += renderToc(item.children);
    }
    html += "</li>";
  }
  html += "</ul>";
  return html;
}

function escape(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
