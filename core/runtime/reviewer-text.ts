import { createHash } from 'node:crypto';

export type ReviewerText = string | Readonly<{
  encoding: 'utf16-rle-v1';
  utf16Length: number;
  jsonSha256: string;
  segments: readonly (string | Readonly<{ codeUnit: number; repeat: number }>)[];
}>;

export function reviewerText(value: string): ReviewerText {
  if (value.length < 128) return value;
  const segments: (string | Readonly<{ codeUnit: number; repeat: number }>)[] = [];
  let literalStart = 0;
  let index = 0;
  while (index < value.length) {
    const codeUnit = value.charCodeAt(index);
    let end = index + 1;
    while (end < value.length && value.charCodeAt(end) === codeUnit) end += 1;
    if (end - index >= 32) {
      if (literalStart < index) segments.push(value.slice(literalStart, index));
      segments.push({ codeUnit, repeat: end - index });
      literalStart = end;
    }
    index = end;
  }
  if (segments.length === 0) return value;
  if (literalStart < value.length) segments.push(value.slice(literalStart));
  const json = JSON.stringify(value);
  const encoded = {
    encoding: 'utf16-rle-v1' as const,
    utf16Length: value.length,
    jsonSha256: createHash('sha256').update(json).digest('hex'),
    segments,
  };
  return Buffer.byteLength(JSON.stringify(encoded)) < Buffer.byteLength(json) ? encoded : value;
}
