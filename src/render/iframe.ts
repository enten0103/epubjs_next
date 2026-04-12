export const useIframe = (prefix: string, empty?: string) => {
  const iframe = document.createElement("iframe");
  iframe.src = "prefix";
  let src: string | undefined = undefined;
  const setSrc = (src: string) => {
    src = `${prefix}/${src}`;
    refresh();
  };
  const refresh = () => {
    if (src) iframe.src = src;
    else iframe.srcdoc = empty ?? `<html><body>empty</bodt></html>`;
  };
  refresh();
  return {
    iframe,
    setSrc,
    refresh,
  };
};
