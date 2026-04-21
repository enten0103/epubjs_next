export type TocItem = {
  label: string;
  href: string;
  children: TocItem[];
};

export type EpubManifestItem = {
  id: string;
  href: string;
  mediaType?: string;
  properties?: string;
};

export type EpubSpineItem = {
  idref: string;
  href: string;
  mediaType?: string;
  properties?: string;
  linear?: string;
};

export type EpubPackage = {
  packagePath: string;
  packageDir: string;
  uniqueIdentifier?: string;
  title?: string;
  language?: string;
  creator?: string;
};

export type EpubBook = {
  id: string;
  pkg: EpubPackage;
  manifest: Map<string, EpubManifestItem>;
  spine: EpubSpineItem[];
  navPath?: string;
  toc?: TocItem[];
};
