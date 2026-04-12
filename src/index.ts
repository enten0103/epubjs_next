import { useIframe } from "./render/iframe.ts";

export const createReader = (prefix: string) => {
  const { iframe, setSrc } = useIframe(prefix);
  const mount = (id: string) => {
    const root = document.getElementById(id);
    if (!root) {
      throw Error("cannot get element by id " + id);
    }
    root.appendChild(iframe);
  };
  return {
    mount,
    setSrc,
  };
};
