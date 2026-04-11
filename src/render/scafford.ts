import type { FileProvider } from "../provider/index.ts";

export const buildIframe = (prefix: string) => {
  const iframe = document.createElement("iframe");
  return iframe;
};

export const initReader = (provider: FileProvider) => {
  const prefix = crypto.randomUUID();
  return (root: HTMLElement) => {
    const iframe = buildIframe(prefix);
    root.appendChild(iframe);
  };
};
