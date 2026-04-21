import type { FileProvider } from "../src/provider/index.ts";

export const createFixtureFileProvider = (basePath = "/paper-fixtures/"): FileProvider => {
  const resolveUrl = (path: string) => {
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    return `${normalizedBase}${path.replace(/^\/+/, "")}`;
  };

  return {
    async getBolbByPath(path) {
      const response = await fetch(resolveUrl(path));
      if (!response.ok) {
        throw new Error(`Fixture not found: ${path}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async getTextByPath(path) {
      const response = await fetch(resolveUrl(path));
      if (!response.ok) {
        throw new Error(`Fixture not found: ${path}`);
      }
      return response.text();
    },
  };
};
