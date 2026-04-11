import type { FileProvider } from "../provider/index.ts";
import type { EpubBook, EpubManifestItem, EpubPackage, EpubSpineItem, TocItem } from "./types.ts";
import { dirname, resolveEpubPath } from "./utils.ts";
import { childrenByLocalName, firstElementByLocalName, getAttr, parseXml, textOf } from "./xml.ts";

type ContainerRootfile = {
  fullPath: string;
  mediaType?: string;
};

/**
 * Parse META-INF/container.xml to locate the rootfile (OPF path).
 * @see EPUB 3.3 §4.2.6.3.1 — Container file (container.xml)
 */
const parseContainerXml = (xmlText: string): ContainerRootfile => {
  const doc = parseXml(xmlText, "application/xml");

  const rootfile = Array.from(doc.getElementsByTagName("*")).filter(
    (el) => el.localName === "rootfile",
  )[0];
  if (!rootfile) {
    throw new Error("Invalid container.xml: missing <rootfile>");
  }

  const fullPath = getAttr(rootfile, "full-path");
  if (!fullPath) {
    throw new Error("Invalid container.xml: missing rootfile@full-path");
  }

  return {
    fullPath,
    mediaType: getAttr(rootfile, "media-type"),
  };
};

/**
 * Parse the OPF package document to extract metadata, manifest, spine,
 * and the path to the EPUB 3 navigation document.
 * @see EPUB 3.3 §5 — Package document
 */

const parseOpf = (
  opfText: string,
  packagePath: string,
): {
  pkg: EpubPackage;
  manifest: Map<string, EpubManifestItem>;
  spine: EpubSpineItem[];
  navPath?: string;
} => {
  const doc = parseXml(opfText, "application/xml");

  // §5.4 — The <package> element
  const packageEl = firstElementByLocalName(doc, "package");
  if (!packageEl) throw new Error("Invalid OPF: missing <package>");

  const packageDir = dirname(packagePath);
  const uniqueIdentifier = getAttr(packageEl, "unique-identifier");

  // §5.5 — Metadata section (dc:title, dc:creator, dc:language are required/expected)
  const metadataEl = childrenByLocalName(packageEl, "metadata")[0];
  const title = metadataEl ? textOf(childrenByLocalName(metadataEl, "title")[0]) : undefined;
  const creator = metadataEl ? textOf(childrenByLocalName(metadataEl, "creator")[0]) : undefined;
  const language = metadataEl ? textOf(childrenByLocalName(metadataEl, "language")[0]) : undefined;

  const pkg: EpubPackage = {
    packagePath,
    packageDir,
    uniqueIdentifier,
    title,
    creator,
    language,
  };

  // §5.6 — Manifest section: each <item> describes a publication resource
  const manifest = new Map<string, EpubManifestItem>();
  const manifestEl = childrenByLocalName(packageEl, "manifest")[0];
  if (!manifestEl) throw new Error("Invalid OPF: missing <manifest>");

  for (const itemEl of childrenByLocalName(manifestEl, "item")) {
    const id = getAttr(itemEl, "id");
    const href = getAttr(itemEl, "href");
    if (!id || !href) continue;

    const resolvedHref = resolveEpubPath(packageDir, href);
    const mediaType = getAttr(itemEl, "media-type");
    const properties = getAttr(itemEl, "properties");
    manifest.set(id, { id, href: resolvedHref, mediaType, properties });
  }

  // §5.7 — Spine section: ordered list of content document references
  const spineEl = childrenByLocalName(packageEl, "spine")[0];
  if (!spineEl) throw new Error("Invalid OPF: missing <spine>");

  const spine: EpubSpineItem[] = [];
  for (const itemrefEl of childrenByLocalName(spineEl, "itemref")) {
    const idref = getAttr(itemrefEl, "idref");
    if (!idref) continue;
    const manifestItem = manifest.get(idref);
    if (!manifestItem) continue;

    spine.push({
      idref,
      href: manifestItem.href,
      mediaType: manifestItem.mediaType,
      properties: manifestItem.properties,
      linear: getAttr(itemrefEl, "linear"),
    });
  }

  // §D.6.3 — The "nav" manifest property identifies the EPUB 3 navigation document
  let navPath: string | undefined;
  for (const item of manifest.values()) {
    const props = item.properties ?? "";
    if (props.split(/\s+/g).includes("nav")) {
      navPath = item.href;
      break;
    }
  }

  return { pkg, manifest, spine, navPath };
};

/**
 * Parse the EPUB 3 Navigation Document (XHTML) to extract the table of contents.
 * @see EPUB 3.3 §7 — EPUB navigation document
 * @see EPUB 3.3 §7.4.2 — The toc nav element
 */
const parseNavToc = (navXhtml: string, navPath: string): TocItem[] => {
  const doc = new DOMParser().parseFromString(navXhtml, "text/html");
  const navEls = Array.from(doc.querySelectorAll("nav"));

  // §7.4.2 — The toc nav is identified by epub:type="toc"
  const tocNav =
    navEls.find((n) => n.getAttribute("epub:type") === "toc") ??
    navEls.find((n) => n.getAttribute("type") === "toc") ??
    navEls[0];

  if (!tocNav) return [];

  const listRoot = tocNav.querySelector("ol, ul");
  if (!listRoot) return [];

  const baseDir = dirname(navPath);

  // §7.3 — The nav element contains ordered lists of links
  const parseList = (listEl: Element): TocItem[] => {
    const items: TocItem[] = [];
    const lis = Array.from(listEl.children).filter((c) => c.tagName.toLowerCase() === "li");
    for (const li of lis) {
      const a = li.querySelector(":scope > a") as HTMLAnchorElement | null;
      const span = li.querySelector(":scope > span");
      const nested = li.querySelector(":scope > ol, :scope > ul");

      const label = (a?.textContent ?? span?.textContent ?? "").trim();
      const rawHref = a?.getAttribute("href") ?? "";

      if (!label) continue;
      if (!rawHref) {
        items.push({
          label,
          href: "",
          children: nested ? parseList(nested) : [],
        });
        continue;
      }

      const resolvedHref = resolveEpubPath(baseDir, rawHref);
      items.push({
        label,
        href: resolvedHref,
        children: nested ? parseList(nested) : [],
      });
    }
    return items;
  };

  return parseList(listRoot);
};

/**
 * Parse an EPUB 3 publication from its container.
 *
 * Follows the EPUB 3.3 specification:
 *   1. Read META-INF/container.xml to locate the package document (§4.2.6.3.1)
 *   2. Parse the OPF package document for metadata, manifest and spine (§5)
 *   3. If present, parse the EPUB 3 Navigation Document for the TOC (§7)
 *   4. Validate and return the assembled EpubBook
 */
export const parseEpub3 = async (provider: FileProvider): Promise<EpubBook> => {
  // 1) container.xml -> rootfile (OPF)
  const containerText = await provider.getTextByPath("META-INF/container.xml");
  const rootfile = parseContainerXml(containerText);

  // 2) OPF: metadata / manifest / spine / nav path
  const opfText = await provider.getTextByPath(rootfile.fullPath);
  const { pkg, manifest, spine, navPath } = parseOpf(opfText, rootfile.fullPath);

  // 3) Navigation document TOC (optional)
  let toc: TocItem[] | undefined;
  if (navPath) {
    try {
      const navText = await provider.getTextByPath(navPath);
      toc = parseNavToc(navText, navPath);
    } catch {
      toc = undefined;
    }
  }

  // 4) Validate: spine must not be empty
  if (spine.length === 0) {
    throw new Error("Invalid OPF: empty spine");
  }

  // Filter out TOC entries with empty hrefs
  if (toc) {
    const filterToc = (items: TocItem[]): TocItem[] =>
      items
        .map((it) => ({ ...it, children: filterToc(it.children) }))
        .filter((it) => it.href !== "");
    toc = filterToc(toc);
  }

  // Use dc:identifier (via unique-identifier) as book id, fall back to package path
  const id = pkg.uniqueIdentifier ?? pkg.packagePath;

  return {
    id,
    pkg,
    manifest,
    spine,
    navPath,
    toc,
  };
};
