export function isTrustedLocalAppOrigin(target = globalThis.location) {
  return target?.protocol === "http:"
    && target?.hostname === "127.0.0.1";
}
