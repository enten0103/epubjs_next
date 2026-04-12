import { unzipSync } from "fflate";

export type FileProvider = {
  getBolbByPath: (path: string) => Promise<Uint8Array>;
  getTextByPath: (path: string) => Promise<string>;
};

// ── Internal: build a FileProvider from an in-memory ZIP entries map ──

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\\/g, "/");
}

function createProviderFromEntries(entries: Record<string, Uint8Array>): FileProvider {
  // Normalize all keys so lookups are resilient to leading-slash differences
  const normalized = new Map<string, Uint8Array>();
  for (const [key, value] of Object.entries(entries)) {
    normalized.set(normalizePath(key), value);
  }

  const resolve = (path: string): Uint8Array => {
    const key = normalizePath(path);
    const data = normalized.get(key);
    if (data === undefined) {
      throw new Error(`File not found in EPUB archive: ${path}`);
    }
    return data;
  };

  return {
    getBolbByPath: async (path) => resolve(path),
    getTextByPath: async (path) => new TextDecoder().decode(resolve(path)),
  };
}

async function readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Create a {@link FileProvider} by decompressing a ZIP/EPUB from an `ArrayBuffer`.
 *
 * This is the lowest-level factory — all other helpers delegate to it.
 *
 * @example
 * ```ts
 * const resp = await fetch("/books/sample.epub");
 * const provider = createFileProviderFromArrayBuffer(await resp.arrayBuffer());
 * ```
 */
export function createFileProviderFromArrayBuffer(buffer: ArrayBuffer): FileProvider {
  const entries = unzipSync(new Uint8Array(buffer));
  return createProviderFromEntries(entries);
}

/**
 * Create a {@link FileProvider} from a `Blob` (or `File`, which extends `Blob`).
 *
 * Works with:
 * - A `File` from `<input type="file">` or drag-and-drop
 * - A `Blob` from `fetch(...).blob()` or any other source
 *
 * @example
 * ```ts
 * input.addEventListener("change", async () => {
 *   const provider = await createFileProviderFromBlob(input.files[0]);
 * });
 * ```
 */
export async function createFileProviderFromBlob(blob: Blob): Promise<FileProvider> {
  const buffer = await readFileAsArrayBuffer(blob);
  return createFileProviderFromArrayBuffer(buffer);
}

/**
 * Create a {@link FileProvider} from a {@link File} object.
 *
 * This is an alias for {@link createFileProviderFromBlob} with a more
 * descriptive name for the common case of receiving a `File` from user input.
 *
 * @example
 * ```ts
 * // Drag-and-drop
 * document.addEventListener("drop", async (e) => {
 *   const file = e.dataTransfer.files[0];
 *   const provider = await createFileProviderFromFile(file);
 * });
 * ```
 */
export async function createFileProviderFromFile(file: File): Promise<FileProvider> {
  return createFileProviderFromBlob(file);
}

/**
 * Create a {@link FileProvider} from a `FileSystemFileHandle`
 * (the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)).
 *
 * Useful when the handle is obtained via `showOpenFilePicker()`, the
 * Origin Private File System, or persisted through IndexedDB.
 *
 * @example
 * ```ts
 * const [handle] = await showOpenFilePicker();
 * const provider = await createFileProviderFromHandle(handle);
 * ```
 */
export async function createFileProviderFromHandle(
  handle: FileSystemFileHandle,
): Promise<FileProvider> {
  const file = await handle.getFile();
  return createFileProviderFromBlob(file);
}

/**
 * Create a {@link FileProvider} by fetching a remote EPUB from a URL.
 *
 * @example
 * ```ts
 * const provider = await createFileProviderFromUrl("/books/sample.epub");
 * ```
 */
export async function createFileProviderFromUrl(
  url: string,
  init?: RequestInit,
): Promise<FileProvider> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch EPUB from ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return createFileProviderFromArrayBuffer(buffer);
}

/**
 * Open a file-picker dialog and create a {@link FileProvider} from the
 * selected EPUB file.
 *
 * Uses the modern File System Access API (`showOpenFilePicker`) when
 * available, falling back to a hidden `<input type="file">` element.
 *
 * @example
 * ```ts
 * const provider = await createFileProviderFromPicker();
 * const book = await parseEpub3(provider);
 * ```
 */
export async function createFileProviderFromPicker(): Promise<FileProvider> {
  // Try the modern File System Access API first
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- API may not exist at runtime
  if (typeof window.showOpenFilePicker === "function") {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "EPUB files",
          accept: { "application/epub+zip": [".epub"] },
        },
      ],
      multiple: false,
    });
    return createFileProviderFromHandle(handle);
  }

  // Fallback: hidden <input type="file">
  return new Promise<FileProvider>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".epub,application/epub+zip";
    input.style.display = "none";

    input.addEventListener("change", async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          reject(new Error("No file selected"));
          return;
        }
        resolve(await createFileProviderFromBlob(file));
      } catch (err) {
        reject(err);
      } finally {
        input.remove();
      }
    });

    input.addEventListener("cancel", () => {
      reject(new Error("File picker was cancelled"));
      input.remove();
    });

    document.body.appendChild(input);
    input.click();
  });
}
