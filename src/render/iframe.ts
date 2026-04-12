export const useIframe = (prefix: string, empty?: string) => {
  const iframe = document.createElement("iframe");
  iframe.src = "prefix";
  let _src: string | undefined = undefined;
  const setSrc = (src: string) => {
    _src = `${prefix}/${src}`;
    refresh();
  };
  const refresh = () => {
    if (_src) {
      iframe.src = _src;
      iframe.removeAttribute("srcdoc");
    } else iframe.srcdoc = empty ?? `<html><body>empty</bodt></html>`;
  };
  refresh();
  return {
    iframe,
    setSrc,
    refresh,
  };
};
