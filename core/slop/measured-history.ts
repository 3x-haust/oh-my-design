import type { Receipt, MetricKind } from '../measure/types.ts';
import { loadMeasurement } from '../measure/files.ts';
import { readArtifact } from '../measure/inputs.ts';
import { digest, sha256 } from '../measure/identity.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import * as v from '../measure/validation.ts';
import type { SlopMeasurementDecision } from '../measure/citations.ts';

export type Finding = { id: string; kind: 'source-candidate' | 'render-warning' | 'measurement'; rule: string; path: string; question: string;
  viewIds: string[]; subjectIds: string[]; basis: 'contract' | 'accessibility' | 'heuristic' | 'coverage'; behavioral: boolean; kinds: MetricKind[]; packetSha256s?: string[] };
export type Checkpoint = { schema: 'slop-checkpoint-v2'; sourceSha256: string; rulesSha256: string; measurements: Receipt[];
  views: { id: string; packetSha256: string; image: Receipt; ir: Receipt; subjectIds: string[] }[]; findings: Finding[]; filesScanned: number;
  parent: { checkpoint: Receipt; review: Receipt | null } | null; signature: string };
export type Review = { schema: 'slop-review-v2'; checkpointSha256: string; summary: string; decisions: SlopMeasurementDecision[]; resolved: SlopMeasurementDecision[]; signature: string };
type Parent = NonNullable<Checkpoint['parent']>;
const fail = (message: string): never => v.fail(`SLOP_REVIEW_REQUIRED: ${message}`);

function historicalRecord<T extends { schema: string; signature: string }>(root: string, receipt: Receipt, directory: 'checkpoints' | 'reviews', schema: T['schema']): T {
  v.receipt(receipt);
  if (receipt.path !== `.omd/slop/${directory}/${receipt.sha256}.json`) fail('invalid historical slop receipt');
  const bytes = readArtifact(root, receipt.path);
  if (sha256(bytes) !== receipt.sha256) fail('historical slop bytes changed');
  const value = JSON.parse(bytes.toString('utf8')) as T;
  const { signature, ...payload } = value;
  if (value.schema !== schema || !verifyNativeObservation(root, schema, digest(payload), signature)) fail('invalid historical slop signature');
  return value;
}

export function historicalCheckpoint(root: string, receipt: Receipt): Checkpoint {
  const checkpoint = historicalRecord<Checkpoint>(root, receipt, 'checkpoints', 'slop-checkpoint-v2');
  const views = checkpoint.measurements.flatMap(r => {
    const packet = loadMeasurement(root, r, { current: false });
    return packet.captures.map(c => ({ id: c.viewId, packetSha256: r.sha256, image: c.capture, ir: c.ir,
      subjectIds: packet.subjects.filter(s => s.viewId === c.viewId).map(s => s.id) }));
  });
  if (digest(views) !== digest(checkpoint.views)) fail('historical measured view inventory changed');
  return checkpoint;
}

export function inheritedSlopFindings(root: string, parent: Parent | null): { findings: Finding[]; rounds: number } {
  const seen = new Set<string>();
  const visit = (link: Parent | null): { findings: Finding[]; rounds: number } => {
    if (!link) return { findings: [], rounds: 0 };
    if (seen.size >= 99 || seen.has(link.checkpoint.sha256)) fail('cyclic measured slop history');
    seen.add(link.checkpoint.sha256);
    const checkpoint = historicalCheckpoint(root, link.checkpoint);
    const inherited = visit(checkpoint.parent);
    if (link.review) {
      const review = historicalRecord<Review>(root, link.review, 'reviews', 'slop-review-v2');
      if (review.checkpointSha256 !== link.checkpoint.sha256) fail('parent review/checkpoint mismatch');
      const exact = (actual: string[], expected: string[]) => new Set(actual).size === actual.length && digest([...actual].sort()) === digest([...expected].sort());
      if (!exact(review.decisions.map(d => d.id), checkpoint.findings.map(f => f.id))
        || !exact(review.resolved.map(d => d.id), inherited.findings.map(f => f.id))
        || review.resolved.some(d => d.status !== 'dismissed')) fail('historical review omitted inherited obligations');
      return { findings: checkpoint.findings.filter(f => review.decisions.some(d => d.id === f.id && d.status === 'confirmed')), rounds: inherited.rounds + 1 };
    }
    const findings = new Map<string, Finding>();
    for (const finding of [...checkpoint.findings, ...inherited.findings]) {
      const previous = findings.get(finding.id);
      const { packetSha256s, ...identity } = finding;
      if (previous) {
        const { packetSha256s: previousPackets, ...previousIdentity } = previous;
        if (digest(previousIdentity) !== digest(identity)) fail('inherited finding identity changed');
        findings.set(finding.id, { ...finding, packetSha256s: [...new Set([...(previousPackets ?? []), ...(packetSha256s ?? [])])] });
      } else findings.set(finding.id, finding);
    }
    return { findings: [...findings.values()], rounds: inherited.rounds + 1 };
  };
  return visit(parent);
}

export function measuredSlopScope(root: string, checkpoint: Checkpoint): string {
  const scopes = checkpoint.measurements.flatMap(receipt =>
    loadMeasurement(root, receipt, { current: false }).scope);
  return digest([...new Set(scopes.map(scope => digest(scope)))].sort());
}
