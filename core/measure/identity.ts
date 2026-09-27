import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';
import type { CaptureBinding, FindingCode, MetricKind, VisualMeasurement } from './types.ts';
export const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`);
export const digest = (value: unknown): string => sha256(canonicalBytes(value));
export const sorted = (values: readonly string[]): string[] => [...new Set(values)].sort();
export function measurementId(method: VisualMeasurement['method'], kind: MetricKind, views: string[], captures: CaptureBinding[], subjects: string[], discriminator = 'inventory'): string {
  const selected = captures.filter(c => views.includes(c.viewId)).sort((a, b) => a.viewId < b.viewId ? -1 : 1);
  return `vm1:${digest({ methodVersion: method.version, implementationSha256: method.implementationSha256, kind, viewKeys: sorted(views), captureSha256s: selected.map(c => c.capture.sha256), irSha256s: selected.map(c => c.ir.sha256), subjectKeys: sorted(subjects), discriminator })}`;
}
export const findingId = (code: FindingCode, measurementIds: string[], expectedContractDigest: string): string => `vf1:${digest({ code, measurementIds: sorted(measurementIds), expectedContractDigest })}`;
export function packetPayload(packet: VisualMeasurement): Omit<VisualMeasurement, 'attestation'> { const { attestation: _, ...payload } = packet; return payload; }
