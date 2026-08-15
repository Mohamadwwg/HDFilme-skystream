declare global {
  function getAndUnpack(js: string): string;
}

export const JsUnpacker = {
  unpack: (js: string): string => {
    return getAndUnpack(js);
  }
};
