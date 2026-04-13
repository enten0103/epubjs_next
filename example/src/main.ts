import { createFileProviderFromBlob } from "epubjs-next/provider";
import { createEpubServiceWorker } from "epubjs-next/provider/server";
import type { EpubServiceWorker, BookHandle } from "epubjs-next/provider/server";
import { parseEpub3 } from "epubjs-next/parser";
import type { TocItem } from "../../src/parser/types.ts";

const fileInput = document.getElementById("file-input") as HTMLInputElement;
const container = document.getElementById("container") as HTMLDivElement;
const status = document.getElementById("status") as HTMLSpanElement;
const bookInfo = document.getElementById("book-info") as HTMLDivElement;
const tocContainer = document.getElementById("toc-container") as HTMLDivElement;
const placeholder = document.getElementById("placeholder") as HTMLDivElement;

let sw: EpubServiceWorker | null = null;
let currentBook: BookHandle | null = null;
let currentPrefix = "";

// Initialize the service worker manager once
async function ensureSW(): Promise<EpubServiceWorker> {
  if (!sw) {
    sw = await createEpubServiceWorker();
  }
  return sw;
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  status.textContent = "Loading…";

  try {
    // Remove the previous book if any
    if (currentBook) {
      currentBook.dispose();
    }

    const manager = await ensureSW();

    const provider = await createFileProviderFromBlob(file);
    const book = await parseEpub3(provider);

    const prefix = `/epub-${Date.now()}/`;
    currentBook = manager.addBook(provider, prefix);
    currentPrefix = currentBook.prefix;

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
      tocContainer.addEventListener("click", onTocClick);
    } else {
      tocContainer.style.display = "none";
    }

    // Show reader, hide placeholder
    container.style.display = "block";
    placeholder.style.display = "none";

    // Navigate to first spine item
    if (book.spine.length > 0) {
      navigateTo(prefix + book.spine[0].href);
    }

    status.textContent = "✓ Loaded";
  } catch (err) {
    status.textContent = `Error: ${(err as Error).message}`;
    console.error(err);
  }
});

function navigateTo(url: string) {
  container.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = url;
  container.appendChild(iframe);
}

function onTocClick(e: Event) {
  const target = e.target as HTMLElement;
  if (target.tagName === "A" && target.dataset.href) {
    e.preventDefault();
    navigateTo(currentPrefix + target.dataset.href);
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
