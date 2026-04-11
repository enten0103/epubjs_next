import { describe, expect, it } from "vite-plus/test";

import type { FileProvider } from "../src/provider/index.ts";
import { parseEpub3 } from "../src/parser/index.ts";

// ── Realistic EPUB 3 fixtures ────────────────────────────────────────

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function buildOpf(opts?: {
  title?: string;
  creator?: string;
  language?: string;
  uniqueId?: string;
  extraManifestItems?: string;
  extraSpineItems?: string;
  noNav?: boolean;
  emptySpine?: boolean;
}): string {
  const o = opts ?? {};
  const uid = o.uniqueId ?? "book-uid";
  const title = o.title ?? "Test Book";
  const creator = o.creator ?? "Test Author";
  const lang = o.language ?? "en";

  const navItem = o.noNav
    ? ""
    : `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`;

  const extra = o.extraManifestItems ?? "";

  const spineItems = o.emptySpine
    ? ""
    : `<itemref idref="ch1"/><itemref idref="ch2" linear="no"/>${o.extraSpineItems ?? ""}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="${uid}" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="${uid}">urn:uuid:12345</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${creator}</dc:creator>
    <dc:language>${lang}</dc:language>
  </metadata>
  <manifest>
    ${navItem}
    <item id="ch1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="Styles/style.css" media-type="text/css"/>
    <item id="img1" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    ${extra}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
}

const NAV_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="Text/chapter1.xhtml">Chapter 1: Introduction</a></li>
      <li>
        <a href="Text/chapter2.xhtml">Chapter 2: Deep Dive</a>
        <ol>
          <li><a href="Text/chapter2.xhtml#sec1">Section 2.1</a></li>
          <li><a href="Text/chapter2.xhtml#sec2">Section 2.2</a></li>
        </ol>
      </li>
    </ol>
  </nav>
</body>
</html>`;

// ── Mock FileProvider ────────────────────────────────────────────────

function createMockProvider(files: Record<string, string>): FileProvider {
  return {
    getTextByPath: async (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return content;
    },
    getBolbByPath: async (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return new TextEncoder().encode(content);
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("parseEpub3", () => {
  it("parses a standard EPUB 3 publication", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      "OEBPS/nav.xhtml": NAV_XHTML,
    });

    const book = await parseEpub3(provider);

    // Package metadata
    expect(book.pkg.title).toBe("Test Book");
    expect(book.pkg.creator).toBe("Test Author");
    expect(book.pkg.language).toBe("en");
    expect(book.pkg.packagePath).toBe("OEBPS/content.opf");
    expect(book.pkg.packageDir).toBe("OEBPS/");
    expect(book.pkg.uniqueIdentifier).toBe("book-uid");
  });

  it("resolves manifest item hrefs relative to the package dir", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      "OEBPS/nav.xhtml": NAV_XHTML,
    });

    const book = await parseEpub3(provider);

    expect(book.manifest.get("ch1")?.href).toBe("OEBPS/Text/chapter1.xhtml");
    expect(book.manifest.get("css")?.href).toBe("OEBPS/Styles/style.css");
    expect(book.manifest.get("img1")?.href).toBe("OEBPS/Images/cover.jpg");
    expect(book.manifest.get("img1")?.properties).toBe("cover-image");
  });

  it("builds the spine from itemref order", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      "OEBPS/nav.xhtml": NAV_XHTML,
    });

    const book = await parseEpub3(provider);

    expect(book.spine).toHaveLength(2);
    expect(book.spine[0].idref).toBe("ch1");
    expect(book.spine[0].href).toBe("OEBPS/Text/chapter1.xhtml");
    expect(book.spine[0].mediaType).toBe("application/xhtml+xml");
    // second spine item has linear="no"
    expect(book.spine[1].idref).toBe("ch2");
    expect(book.spine[1].linear).toBe("no");
  });

  it("identifies the nav document path", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      "OEBPS/nav.xhtml": NAV_XHTML,
    });

    const book = await parseEpub3(provider);

    expect(book.navPath).toBe("OEBPS/nav.xhtml");
  });

  it("parses the nav TOC with nested children", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      "OEBPS/nav.xhtml": NAV_XHTML,
    });

    const book = await parseEpub3(provider);

    expect(book.toc).toBeDefined();
    expect(book.toc!).toHaveLength(2);

    expect(book.toc![0].label).toBe("Chapter 1: Introduction");
    expect(book.toc![0].href).toBe("OEBPS/Text/chapter1.xhtml");
    expect(book.toc![0].children).toHaveLength(0);

    // Nested TOC
    const ch2 = book.toc![1];
    expect(ch2.label).toBe("Chapter 2: Deep Dive");
    expect(ch2.children).toHaveLength(2);
    expect(ch2.children[0].label).toBe("Section 2.1");
    expect(ch2.children[0].href).toBe("OEBPS/Text/chapter2.xhtml#sec1");
    expect(ch2.children[1].href).toBe("OEBPS/Text/chapter2.xhtml#sec2");
  });

  it("works when no nav document exists", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf({ noNav: true }),
    });

    const book = await parseEpub3(provider);

    expect(book.navPath).toBeUndefined();
    expect(book.toc).toBeUndefined();
    expect(book.spine).toHaveLength(2);
  });

  it("gracefully handles nav fetch failure", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      // nav.xhtml is intentionally missing
    });

    const book = await parseEpub3(provider);

    expect(book.navPath).toBe("OEBPS/nav.xhtml");
    expect(book.toc).toBeUndefined();
  });

  it("throws on empty spine", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf({ emptySpine: true, noNav: true }),
    });

    await expect(parseEpub3(provider)).rejects.toThrow("empty spine");
  });

  it("throws on invalid container.xml missing rootfile", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": `<?xml version="1.0"?><container><rootfiles></rootfiles></container>`,
    });

    await expect(parseEpub3(provider)).rejects.toThrow("missing <rootfile>");
  });

  it("throws on OPF missing <package>", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": `<?xml version="1.0"?><notpackage/>`,
    });

    await expect(parseEpub3(provider)).rejects.toThrow("missing <package>");
  });

  it("falls back to packagePath as id when uniqueIdentifier is absent", async () => {
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>No UID</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": opf,
    });

    const book = await parseEpub3(provider);
    expect(book.id).toBe("OEBPS/content.opf");
  });

  it("handles rootfile in root directory (no subdirectory)", async () => {
    const container = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">root-book</dc:identifier>
    <dc:title>Root OPF</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

    const provider = createMockProvider({
      "META-INF/container.xml": container,
      "package.opf": opf,
    });

    const book = await parseEpub3(provider);
    expect(book.pkg.packageDir).toBe("");
    expect(book.spine[0].href).toBe("chapter1.xhtml");
  });

  it("filters out empty-href TOC entries but keeps the rest", async () => {
    const navWithEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="toc">
    <ol>
      <li><span>Part One</span>
        <ol>
          <li><a href="Text/chapter1.xhtml">Real Chapter</a></li>
        </ol>
      </li>
      <li><a href="Text/chapter2.xhtml">Chapter 2</a></li>
    </ol>
  </nav>
</body>
</html>`;

    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      "OEBPS/nav.xhtml": navWithEmpty,
    });

    const book = await parseEpub3(provider);

    // "Part One" (span, no href) should be filtered out, but its child should survive
    // After filterToc: items with href="" are removed, their children are lost
    // because the parent is removed first
    expect(book.toc).toBeDefined();
    const labels = book.toc!.map((t) => t.label);
    expect(labels).toContain("Chapter 2");
    // "Part One" has empty href so it's filtered
    expect(labels).not.toContain("Part One");
  });

  it("preserves manifest item properties like cover-image and nav", async () => {
    const provider = createMockProvider({
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": buildOpf(),
      "OEBPS/nav.xhtml": NAV_XHTML,
    });

    const book = await parseEpub3(provider);

    const nav = book.manifest.get("nav");
    expect(nav?.properties).toBe("nav");

    const cover = book.manifest.get("img1");
    expect(cover?.properties).toBe("cover-image");
    expect(cover?.mediaType).toBe("image/jpeg");
  });
});
