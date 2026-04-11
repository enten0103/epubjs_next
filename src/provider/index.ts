export type FileProvider = {
  getBolbByPath: (path: string) => Promise<Uint8Array>;
  getTextByPath: (path: string) => Promise<string>;
};
