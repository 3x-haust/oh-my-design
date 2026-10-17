/** Chromium serializes the legacy system-font alias as system-ui.
 * Normalize comparison names only; retain authored and measured evidence bytes. */
export function canonicalFontFamilies(stack: readonly string[]): string[] {
  return stack.map(family => {
    const name = family.trim().replace(/^["']|["']$/g, '').toLowerCase();
    return name === 'blinkmacsystemfont' ? 'system-ui' : name;
  });
}
