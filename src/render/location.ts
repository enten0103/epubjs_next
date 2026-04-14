export type EpubLocation = {
  html: string;
  // Omitted or empty indexs means "the document root", which is the same
  // navigation semantic as an explicit [0] root marker.
  indexs?: number[];
};
