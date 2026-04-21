/** Chrome: sau khi Reload extension, content script cũ trên tab vẫn chạy nhưng API extension chết. */
export function isExtensionContextInvalidated(err) {
  const m = err?.message != null ? String(err.message) : String(err ?? '');
  return m.includes('Extension context invalidated');
}
