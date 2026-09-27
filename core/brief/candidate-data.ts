import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import { readStableProjectFile, nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

export type Receipt = Readonly<{ path: string; sha256: string }>;
export function fail(message: string): never { throw new Error(`DIRECTION_CONTRACT: ${message}`); }
export const hash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const digest = (value: unknown): string => hash(canonicalRouteJson(value));
export const jsonBytes = (value: unknown): string => `${canonicalRouteJson(value)}\n`;
export function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('expected plain object');
  const item = value as Record<string, unknown>;
  if (keys && Object.keys(item).sort().join('\0') !== [...keys].sort().join('\0')) return fail(`expected exact fields: ${keys.join(', ')}`);
  for (const key of Reflect.ownKeys(item)) if (typeof key !== 'string' || !('value' in Object.getOwnPropertyDescriptor(item, key)!)) return fail('only JSON fields are permitted');
  return item;
}
export function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) return fail('expected nonempty text'); return value; }
export function id(value: unknown): string { const v = text(value); if (!/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/.test(v)) return fail('invalid id'); return v; }
export function sha(value: unknown): string { const v = text(value); if (!/^[a-f0-9]{64}$/.test(v)) return fail('invalid SHA-256'); return v; }
export function enumeration<const T extends readonly (string | number)[]>(value: unknown, values: T): T[number] { if (!values.includes(value as never)) return fail(`expected ${values.join('|')}`); return value as T[number]; }
export function list<T>(value: unknown, parse: (value: unknown) => T): T[] { if (!Array.isArray(value)) return fail('expected array'); return value.map(parse); }
export function unique<T>(values: readonly T[], key: (v: T) => string = v => String(v)): void { if (new Set(values.map(key)).size !== values.length) fail('duplicate identifiers'); }
export function ids(value: unknown, nonempty = false): string[] { const out = list(value, id); unique(out); if (nonempty && !out.length) fail('expected nonempty identifiers'); return out; }
export function positive(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return fail('expected positive integer'); return value; }
export function boolean(value: unknown): boolean { if (typeof value !== 'boolean') return fail('expected boolean'); return value; }
export function path(value: unknown): string { const v = text(value); if (v.startsWith('/') || v.includes('\\') || v.includes('\0') || /^[A-Za-z]:/.test(v) || v.split('/').some(p => !p || p === '.' || p === '..')) return fail('expected contained canonical path'); return v; }
export function receipt(value: unknown): Receipt { const v = object(value, ['path', 'sha256']); return { path: path(v.path), sha256: sha(v.sha256) }; }
export const nullableReceipt = (value: unknown): Receipt | null => value === null ? null : receipt(value);
export function readBytes(root: string, relativePath: string): Buffer { return readStableProjectFile({ root, path: resolve(root, path(relativePath)), label: relativePath, fs: nodeStableProjectFileSystem() }); }
export function readReceipt(root: string, r: Receipt): Buffer { const bytes = readBytes(root, r.path); if (hash(bytes) !== r.sha256) return fail(`stale receipt: ${r.path}`); return bytes; }
export function fileReceipt(root: string, relativePath: string): Receipt { return { path: relativePath, sha256: hash(readBytes(root, relativePath)) }; }
export function publishRecord(writer: ProjectWriteAdapter, directory: string, value: unknown): Receipt { const bytes = jsonBytes(value), sha256 = hash(bytes), path = `${directory}/sha256-${sha256}.json`; writer.writeContentAddressed(path, bytes); return { path, sha256 }; }
