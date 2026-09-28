import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { sha256 } from './board-artifacts.ts';
import { currentReferenceEvidenceAfter, publicDiscoveryUrl, type DiscoveryLane } from './discovery-record.ts';

export const SEARCH_LEADS_SCHEMA = 'reference-search-leads-v1' as const;
export type SearchLeadsInput = Readonly<{ schema: typeof SEARCH_LEADS_SCHEMA; lane: DiscoveryLane; query: string;
  urls: readonly string[]; provider: string; tool: string; observedAt: string }>;
export type SearchLeads = SearchLeadsInput & Readonly<{ sourceContractSha256: string; registeredAt: string;
  /** Caller-reported search metadata and unsigned URLs are never OMD observation evidence. */
  provenance: 'caller-reported-unsigned-leads' }>;
export type SearchLeadsReceipt = Readonly<{ path: string; sha256: string }>;
const invalid = (reason: string): never => { throw new Error(`REFERENCE_SEARCH_LEADS_INVALID: ${reason}`); };
function plain(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid('expected a plain record');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) return invalid('missing or unknown fields');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max ? value : invalid('invalid or oversized text');
}
function timestamp(value: unknown): string {
  const date = text(value, 40);
  return Number.isFinite(Date.parse(date)) && new Date(date).toISOString() === date ? date : invalid('invalid timestamp');
}
export function parseSearchLeadsInput(value: unknown): SearchLeadsInput {
  const row = plain(value, ['schema', 'lane', 'query', 'urls', 'provider', 'tool', 'observedAt']);
  if (row.schema !== SEARCH_LEADS_SCHEMA || (row.lane !== 'domain' && row.lane !== 'design')) return invalid('schema or lane');
  if (!Array.isArray(row.urls) || row.urls.length > 30 || Object.keys(row.urls).length !== row.urls.length) return invalid('invalid URL array');
  const urls = row.urls.map(url => { try { const parsed = publicDiscoveryUrl(url); if (new URL(parsed).port) return invalid('non-default port'); return parsed; } catch { return invalid('unsafe URL'); } });
  if (new Set(urls).size !== urls.length) return invalid('duplicate URLs');
  return { schema: SEARCH_LEADS_SCHEMA, lane: row.lane, query: text(row.query, 512), urls,
    provider: text(row.provider, 120), tool: text(row.tool, 120), observedAt: timestamp(row.observedAt) };
}
export function publishSearchLeads(writer: ProjectWriteAdapter, sourceContractSha256: string, value: unknown): SearchLeadsReceipt {
  const input = parseSearchLeadsInput(value);
  if (!/^[a-f0-9]{64}$/.test(sourceContractSha256)) return invalid('route digest');
  const record: SearchLeads = { ...input, sourceContractSha256, registeredAt: new Date().toISOString(), provenance: 'caller-reported-unsigned-leads' };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const digest = sha256(bytes);
  const path = `.omd/discovery/${input.lane}/leads/${digest}.json`;
  writer.writeContentAddressed(path, bytes);
  return { path, sha256: digest };
}
export function readSearchLeads(root: string, receipt: SearchLeadsReceipt, lane: DiscoveryLane, sourceContractSha256: string): SearchLeads {
  if (!/^[a-f0-9]{64}$/.test(receipt.sha256) || receipt.path !== `.omd/discovery/${lane}/leads/${receipt.sha256}.json`) return invalid('receipt path');
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, receipt.path), label: receipt.path, fs: nodeStableProjectFileSystem() });
  if (sha256(bytes) !== receipt.sha256) return invalid('receipt content changed');
  let decoded: unknown;
  try { decoded = JSON.parse(bytes.toString('utf8')); } catch { return invalid('invalid JSON'); }
  const row = plain(decoded, ['schema', 'lane', 'query', 'urls', 'provider', 'tool', 'observedAt', 'sourceContractSha256', 'registeredAt', 'provenance']);
  const input = parseSearchLeadsInput(Object.fromEntries(['schema', 'lane', 'query', 'urls', 'provider', 'tool', 'observedAt'].map(key => [key, row[key]])));
  if (input.lane !== lane || row.sourceContractSha256 !== sourceContractSha256 || row.provenance !== 'caller-reported-unsigned-leads') return invalid('route or provenance mismatch');
  const registeredAt = timestamp(row.registeredAt);
  if (Date.parse(registeredAt) < currentReferenceEvidenceAfter(root)
    || Date.parse(registeredAt) > Date.now() + 5 * 60 * 1000) return invalid('lead is stale for current route');
  return { ...input, sourceContractSha256, registeredAt, provenance: 'caller-reported-unsigned-leads' };
}
export function fetchSearchLeads(root: string, lane: DiscoveryLane, sourceContractSha256: string): readonly SearchLeads[] {
  const path = resolve(root, `.omd/discovery/${lane}/leads`);
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return invalid('unsafe leads directory');
  return readdirSync(path).sort().flatMap(name => {
    const match = /^([a-f0-9]{64})\.json$/.exec(name);
    if (!match) return [];
    try {
      const lead = readSearchLeads(root, { path: `.omd/discovery/${lane}/leads/${name}`, sha256: match[1]! }, lane, sourceContractSha256);
      return Date.parse(lead.registeredAt) >= currentReferenceEvidenceAfter(root) ? [lead] : [];
    } catch (error) { if (error instanceof Error) return []; throw error; }
  });
}
