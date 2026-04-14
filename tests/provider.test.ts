import { describe, expect, it, vi } from "vite-plus/test";
import { zipSync } from "fflate";

import {
  createFileProviderFromArrayBuffer,
  createFileProviderFromBlob,
  createFileProviderFromFile,
  createFileProviderFromHandle,
  createFileProviderFromPicker,
  createFileProviderFromUrl,
} from "../src/provider/index.ts";

// ── Helper: build a minimal EPUB ZIP in memory ──────────────────────

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const CONTENT_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">test-book-123</dc:identifier>
    <dc:title>Test Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

const CHAPTER1 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><p>Hello, EPUB!</p></body>
</html>`;

const encoder = new TextEncoder();

function buildEpubZip(files?: Record<string, string>): Uint8Array {
  const defaults: Record<string, string> = {
    "META-INF/container.xml": CONTAINER_XML,
    "OEBPS/content.opf": CONTENT_OPF,
    "OEBPS/chapter1.xhtml": CHAPTER1,
  };
  const merged = { ...defaults, ...files };

  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(merged)) {
    entries[path] = encoder.encode(content);
  }
  return zipSync(entries);
}

/** Get a clean ArrayBuffer copy from fflate output (avoids SharedArrayBuffer TS issues). */
function epubBuffer(files?: Record<string, string>): ArrayBuffer {
  const zip = buildEpubZip(files);
  return zip.slice().buffer as ArrayBuffer;
}

/** Get a File from the epub zip. */
function epubFile(name: string, files?: Record<string, string>): File {
  return new File([new Uint8Array(epubBuffer(files))], name, {
    type: "application/epub+zip",
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("createFileProviderFromArrayBuffer", () => {
  it("decompresses a ZIP and resolves text by path", async () => {
    const provider = createFileProviderFromArrayBuffer(epubBuffer());

    const text = await provider.getTextByPath("META-INF/container.xml");
    expect(text).toContain("<rootfile");
    expect(text).toContain("OEBPS/content.opf");
  });

  it("decompresses a ZIP and resolves binary by path", async () => {
    const provider = createFileProviderFromArrayBuffer(epubBuffer());

    const data = await provider.getBolbByPath("OEBPS/chapter1.xhtml");
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBeGreaterThan(0);

    const text = new TextDecoder().decode(data);
    expect(text).toContain("Hello, EPUB!");
  });

  it("throws for a non-existent path", async () => {
    const provider = createFileProviderFromArrayBuffer(epubBuffer());

    await expect(provider.getTextByPath("no/such/file.xml")).rejects.toThrow(
      "File not found in EPUB archive",
    );
  });

  it("normalizes leading slashes in lookup paths", async () => {
    const provider = createFileProviderFromArrayBuffer(epubBuffer());

    // Leading slash should still resolve
    const text = await provider.getTextByPath("/META-INF/container.xml");
    expect(text).toContain("<rootfile");
  });

  it("handles custom file entries", async () => {
    const provider = createFileProviderFromArrayBuffer(
      epubBuffer({ "extra/data.txt": "custom content" }),
    );

    const text = await provider.getTextByPath("extra/data.txt");
    expect(text).toBe("custom content");
  });

  it("throws on invalid (non-ZIP) data", () => {
    const garbage = new ArrayBuffer(64);
    expect(() => createFileProviderFromArrayBuffer(garbage)).toThrow();
  });
});

describe("createFileProviderFromBlob", () => {
  it("creates a provider from a Blob", async () => {
    const blob = new Blob([new Uint8Array(epubBuffer())], { type: "application/epub+zip" });

    const provider = await createFileProviderFromBlob(blob);
    const text = await provider.getTextByPath("OEBPS/content.opf");
    expect(text).toContain("<dc:title>Test Book</dc:title>");
  });

  it("works with an empty-type Blob", async () => {
    const blob = new Blob([new Uint8Array(epubBuffer())]);

    const provider = await createFileProviderFromBlob(blob);
    const data = await provider.getBolbByPath("OEBPS/chapter1.xhtml");
    expect(new TextDecoder().decode(data)).toContain("Hello, EPUB!");
  });
});

describe("createFileProviderFromFile", () => {
  it("creates a provider from a File object", async () => {
    const provider = await createFileProviderFromFile(epubFile("book.epub"));
    const text = await provider.getTextByPath("OEBPS/content.opf");
    expect(text).toContain("Test Book");
  });

  it("works with a File that has no extension", async () => {
    const file = new File([new Uint8Array(epubBuffer())], "mybook");
    const provider = await createFileProviderFromFile(file);
    const text = await provider.getTextByPath("META-INF/container.xml");
    expect(text).toContain("container");
  });
});

describe("createFileProviderFromHandle", () => {
  it("reads a FileSystemFileHandle and creates a provider", async () => {
    const file = epubFile("handled.epub");
    const getFile = vi.fn().mockResolvedValue(file);
    const handle = {
      getFile,
    } as unknown as FileSystemFileHandle;

    const provider = await createFileProviderFromHandle(handle);
    const text = await provider.getTextByPath("OEBPS/content.opf");
    expect(text).toContain("Test Book");
    expect(getFile).toHaveBeenCalledOnce();
  });
});

describe("createFileProviderFromUrl", () => {
  it("fetches from a URL and creates a provider", async () => {
    const buf = epubBuffer();

    const mockResponse = {
      ok: true,
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(buf),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    try {
      const provider = await createFileProviderFromUrl("https://example.com/book.epub");
      const text = await provider.getTextByPath("OEBPS/content.opf");
      expect(text).toContain("Test Book");

      expect(fetch).toHaveBeenCalledWith("https://example.com/book.epub", undefined);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("passes RequestInit options to fetch", async () => {
    const buf = epubBuffer();

    const mockResponse = {
      ok: true,
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(buf),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    try {
      const init: RequestInit = { headers: { Authorization: "Bearer token" } };
      await createFileProviderFromUrl("https://example.com/book.epub", init);

      expect(fetch).toHaveBeenCalledWith("https://example.com/book.epub", init);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws on HTTP error responses", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    try {
      await expect(createFileProviderFromUrl("https://example.com/missing.epub")).rejects.toThrow(
        "Failed to fetch EPUB from https://example.com/missing.epub: 404 Not Found",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("createFileProviderFromPicker", () => {
  it("uses showOpenFilePicker when available", async () => {
    const file = epubFile("picked.epub");
    const handle = { getFile: vi.fn().mockResolvedValue(file) };

    const mockPicker = vi.fn().mockResolvedValue([handle]);
    Object.defineProperty(window, "showOpenFilePicker", {
      value: mockPicker,
      configurable: true,
      writable: true,
    });

    try {
      const provider = await createFileProviderFromPicker();
      const text = await provider.getTextByPath("OEBPS/content.opf");
      expect(text).toContain("Test Book");

      expect(mockPicker).toHaveBeenCalledWith(expect.objectContaining({ multiple: false }));
    } finally {
      Object.defineProperty(window, "showOpenFilePicker", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }
  });

  it("falls back to <input type=file> when showOpenFilePicker is absent", async () => {
    // Ensure showOpenFilePicker doesn't exist
    const originalPicker = window.showOpenFilePicker;
    Object.defineProperty(window, "showOpenFilePicker", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const file = epubFile("fallback.epub");

    // Mock document.createElement to intercept the <input> element
    const originalCreateElement = document.createElement.bind(document);
    let capturedInput: HTMLInputElement | undefined;

    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tag, options);
        if (tag === "input") {
          capturedInput = el as HTMLInputElement;
          // Monkey-patch click to simulate file selection
          Object.defineProperty(capturedInput, "click", {
            value: () => {
              // Simulate user picking a file
              Object.defineProperty(capturedInput!, "files", {
                value: [file],
                configurable: true,
              });
              capturedInput!.dispatchEvent(new Event("change"));
            },
            configurable: true,
          });
        }
        return el;
      });

    try {
      const provider = await createFileProviderFromPicker();
      const text = await provider.getTextByPath("OEBPS/content.opf");
      expect(text).toContain("Test Book");
      expect(capturedInput).toBeDefined();
      expect(capturedInput!.type).toBe("file");
      expect(capturedInput!.accept).toBe(".epub,application/epub+zip");
    } finally {
      createElementSpy.mockRestore();
      Object.defineProperty(window, "showOpenFilePicker", {
        value: originalPicker,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe("FileProvider integration", () => {
  it("provider entries can be used to parse an EPUB structure", async () => {
    const provider = createFileProviderFromArrayBuffer(epubBuffer());

    // Simulate what parseEpub3 does: read container → OPF → content
    const container = await provider.getTextByPath("META-INF/container.xml");
    expect(container).toContain("OEBPS/content.opf");

    const opf = await provider.getTextByPath("OEBPS/content.opf");
    expect(opf).toContain("chapter1.xhtml");

    const chapter = await provider.getTextByPath("OEBPS/chapter1.xhtml");
    expect(chapter).toContain("Hello, EPUB!");
  });

  it("binary round-trip preserves byte-for-byte content", async () => {
    const binaryContent = new Uint8Array([0, 1, 2, 127, 128, 255]);
    const entries: Record<string, Uint8Array> = {
      "META-INF/container.xml": encoder.encode(CONTAINER_XML),
      "binary.dat": binaryContent,
    };
    const zip = zipSync(entries);
    const buf = zip.slice().buffer as ArrayBuffer;
    const provider = createFileProviderFromArrayBuffer(buf);

    const result = await provider.getBolbByPath("binary.dat");
    expect(result).toEqual(binaryContent);
  });
});
