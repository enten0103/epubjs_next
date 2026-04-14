export const useIframe = (prefix: string, empty?: string) => {
  const iframe = document.createElement("iframe");
  iframe.src = "about:blank";
  const normalizedPrefix = prefix.replace(/\/+$/, "");
  let _src: string | undefined = undefined;
  const setSrc = (src: string) => {
    const normalizedSrc = src.replace(/^\/+/, "");
    _src = normalizedPrefix ? `${normalizedPrefix}/${normalizedSrc}` : `/${normalizedSrc}`;
    refresh();
  };
  const refresh = () => {
    if (_src) {
      iframe.removeAttribute("srcdoc");
      iframe.src = _src;
      return;
    }
    if (empty) {
      iframe.srcdoc = empty;
      return;
    }
    iframe.removeAttribute("srcdoc");
    iframe.src = "about:blank";
  };
  refresh();
  return {
    iframe,
    setSrc,
  };
};
