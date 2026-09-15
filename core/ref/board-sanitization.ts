import { isIP } from 'node:net';

const control = /[\u0000-\u001f\u007f]/;
const markup = /<\/?[a-z!]/i;
const protocol = /:\/\/|\/\//;
const uriScheme = /\b[a-z][a-z0-9+.-]*:(?=\S)/i;
const selectorScheme = /\b(?:https?|data|file|blob|javascript|mailto|tel|ftp|ftps|ws|wss):(?=\S)/i;
const localhost = /\blocalhost\b/i;
const posixAbsolutePath = /(?:^|[\s"'`(])\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+/;
const windowsAbsolutePath = /(?:^|[\s"'`(])(?:[a-z]:[\\/]|\\\\[^\\/\s]+[\\/])/i;
const relativePath = /(?:^|[\s"'`(\\/])\.\.?[\\/]/;
const omdPath = /(?:^|[\s"'`(\\/])\.omd[\\/]/i;
const localPath = /(?:^|[\s"'`(])(?=[A-Za-z0-9._-]*[A-Za-z._-])[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)+(?=$|[^A-Za-z0-9._-])/;
const rootOnlySlash = /(?:^|[\s"'`(])\/(?=$|[\s)"'`,;:!?])/;
const encodedSeparator = /%2f|%5c/i;
const imageFilename = /(?:^|[\s"'`(])(?:[A-Za-z0-9_-]+(?:[\\/][A-Za-z0-9._-]+)*)\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)(?=$|[^A-Za-z0-9_-])/i;
const sourceRecordId = /(?:^|[^a-z0-9-])(?:fragment|ref)-[0-9a-f]{16}(?=$|[^a-z0-9-])/;
const imageBase64 = /iVBORw0KGgo|data:image/i;
const longBase64 = /(?:^|[^A-Za-z0-9+/=])[A-Za-z0-9+/]{128,}={0,2}(?=$|[^A-Za-z0-9+/=])/;
const sourceArtifactToken = /^\s*(?:capture|screenshot|crop|reference|image)\s*$/i;
// A slash between two known measurement units is valid prose (for example `3.1 mm/s`),
// but arbitrary slash-separated tokens remain a local/source-path carrier.  Keep the
// exception narrow and require a numeric value immediately before the unit ratio.
const measurementUnit = '(?:mm|cm|km|μm|um|m|in|ft|px|pt|em|rem|vh|vw|vmin|vmax|ms|s|sec|secs|min|mins|h|hr|hrs|d|day|days|kg|g|mg|lb|lbs|n|kn|w|kw|wh|kwh|v|a|hz|khz|%|yr|yrs|year|years|mo|month|months)';
const measurementRatio = new RegExp(`(?<![A-Za-z0-9._/\\\\-])${measurementUnit}\\s*/\\s*${measurementUnit}(?![A-Za-z0-9_-])`, 'giu');
const numericMeasurementPrefix = /(?:^|[\s([{,:;!?→←↔⇢–—=+\-])[-+]?\d+(?:[.,]\d+)?\s*$/u;
const dnsLabel = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const dnsTerminalLabel = '[a-z](?:[a-z0-9-]*[a-z0-9])?';
const dnsHost = new RegExp(`(?:^|[^\\w.-])(?:${dnsLabel}\\.)+${dnsTerminalLabel}\\.?(?=$|[^\\w.-])`, 'i');
const ipToken = /(?:^|[^a-z0-9:])(\[[^\]\s]+\]|[0-9a-f:.]+)(?=$|[^a-z0-9:])/gi;
const normalizedIp = (token: string): string => token.startsWith('[') && token.endsWith(']') ? token.slice(1, -1) : token;
const hasIpLiteral = (value: string): boolean => [...value.matchAll(ipToken)].some((match) => {
  const token = match[1];
  return token !== undefined && isIP(normalizedIp(token)) !== 0;
});
const commonCarrier = (value: string): boolean => control.test(value) || markup.test(value) || protocol.test(value) || localhost.test(value) || dnsHost.test(value) || hasIpLiteral(value);
const localArtifactPayload = (value: string): boolean => posixAbsolutePath.test(value) || windowsAbsolutePath.test(value) || relativePath.test(value) || omdPath.test(value) || localPath.test(value) || rootOnlySlash.test(value) || encodedSeparator.test(value) || imageFilename.test(value) || sourceRecordId.test(value) || imageBase64.test(value) || longBase64.test(value) || sourceArtifactToken.test(value);
type SelectorViews = { readonly literal: string; readonly canonical: string };
const isHexDigit = (value: string): boolean => /^[0-9a-f]$/i.test(value);
const isInvalidCodePoint = (value: number): boolean => value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff);
const isNewline = (value: string): boolean => value === '\n' || value === '\r' || value === '\f';
const decodedSelectorViews = (value: string): SelectorViews | undefined => {
  let literal = ''; let canonical = '';
  for (let index = 0; index < value.length;) {
    const character = value[index];
    if (character === undefined) return undefined;
    if (character !== '\\') { literal += character; canonical += character; index += 1; continue; }
    const escaped = value[index + 1];
    if (escaped === undefined || isNewline(escaped)) return undefined;
    if (!isHexDigit(escaped)) { literal += 'x'; canonical += escaped; index += 2; continue; }
    let end = index + 1;
    while (end < value.length && end < index + 7 && isHexDigit(value[end] ?? '')) end += 1;
    const codePoint = Number.parseInt(value.slice(index + 1, end), 16);
    if (isInvalidCodePoint(codePoint)) return undefined;
    literal += 'x'; canonical += String.fromCodePoint(codePoint); index = end;
    const terminator = value[index];
    if (terminator === undefined) continue;
    if (isNewline(terminator)) return undefined;
    if (terminator === ' ' || terminator === '\t') index += 1;
  }
  return { literal, canonical };
};
const selectorPayload = (value: string): boolean => commonCarrier(value) || selectorScheme.test(value) || localArtifactPayload(value);

export function hasSourcePayload(value: string): boolean {
  return commonCarrier(value) || uriScheme.test(value);
}

export function hasAssemblyPayload(value: string): boolean {
  return hasSourcePayload(value) || localArtifactPayload(value);
}

/**
 * Falsifiers are the one assembly field that may name a measured rate such as `3.1 mm/s`.
 * Mask only a recognized unit ratio when it has a numeric prefix and is not path-adjacent;
 * the original value is still returned by the parser, so exact acquisition-zone matching is
 * unchanged.  All other assembly text continues through the strict global sanitizer.
 */
export function hasFalsifierAssemblyPayload(value: string): boolean {
  // Inspect the original bytes before any unit masking.  In particular, `\\s*` below
  // must never normalize a control character hidden between the two units.
  if (hasSourcePayload(value)) return true;
  let cursor = 0;
  let masked = '';
  let unsafeMeasurementPath = false;
  let unrecognizedMeasurementRatio = false;
  for (const match of value.matchAll(measurementRatio)) {
    const index = match.index ?? 0;
    const token = match[0];
    const before = value.slice(0, index);
    const after = value.slice(index + token.length);
    if (!numericMeasurementPrefix.test(before)) {
      unrecognizedMeasurementRatio = true;
      continue;
    }
    // A slash/backslash or a filename-like suffix makes the token part of a path, not prose.
    if (/^[\\/]/.test(after) || /^\.[A-Za-z0-9_-]/.test(after)) {
      unsafeMeasurementPath = true;
      continue;
    }
    masked += value.slice(cursor, index) + 'unit-ratio';
    cursor = index + token.length;
  }
  masked += value.slice(cursor);
  return unsafeMeasurementPath || unrecognizedMeasurementRatio || hasAssemblyPayload(masked);
}

export function hasSelectorPayload(value: string): boolean {
  const views = decodedSelectorViews(value);
  return views === undefined || selectorPayload(views.literal) || selectorPayload(views.canonical);
}
