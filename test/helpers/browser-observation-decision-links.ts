import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { DesignDecision } from '../../core/deliberation/contracts.ts';
import {
  BROWSER_OBSERVATION_SCHEMA,
  BROWSER_OBSERVATION_SET_SCHEMA,
  browserObservationSha256,
  designDecisionSha256,
  type BrowserObservationCore,
} from '../../core/runtime/browser-observation.ts';

export type BrowserFixtureCapture = Readonly<{
  path: string;
  sha256: string;
  viewport: Readonly<{ width: number; height: number }>;
}>;
export type BrowserFixtureEntry = BrowserFixtureCapture & Readonly<{ testedState: string }>;
type BrowserEvidence = Readonly<{ browserObservations: Readonly<{
  schema: typeof BROWSER_OBSERVATION_SET_SCHEMA;
  decisionGraphSha256: string;
  observations: readonly Readonly<BrowserObservationCore & { observationSha256: string }>[];
}> }>;
export type BrowserDecisionFixture = Readonly<{
  evidence(entries: readonly BrowserFixtureEntry[]): BrowserEvidence;
}>;

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const crc32 = (bytes: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
export function browserFixturePng(width: number, height: number): Buffer {
  const chunk = (type: string, value: Buffer): Buffer => {
    const bytes = Buffer.alloc(value.length + 12);
    bytes.writeUInt32BE(value.length, 0); bytes.write(type, 4); value.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, value.length + 8)), value.length + 8);
    return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value);
  return `{${entries.sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
};
const decision = (): DesignDecision => ({
  id: 'hero-strategy', stage: 'composition', risk: 'medium', owner: 'omd-composer',
  question: 'Which hero structure keeps the primary action visible?',
  alternatives: [{ id: 'copy-first', label: 'Copy first' }, { id: 'demo-first', label: 'Demo first' }],
  selected: 'demo-first', evidence: ['capture:hero-responsive'], constraints: ['Primary action remains visible'],
  rejected: [{ id: 'copy-first', reason: 'The measured capture leaves less room for the primary action.' }],
  affects: ['zone:hero'], dependsOn: [], reversible: true, tradeoffs: [],
});
function observation(entry: BrowserFixtureEntry, reference: Readonly<{ decisionId: string; decisionSha256: string }>): BrowserObservationCore {
  return {
    schema: BROWSER_OBSERVATION_SCHEMA,
    testedUrl: 'file://fixture/',
    testedState: entry.testedState,
    viewport: entry.viewport,
    observableResult: { kind: 'screenshot', capture: { path: entry.path, sha256: entry.sha256 }, result: { measurement: 'viewport-pixels', width: entry.viewport.width, height: entry.viewport.height } },
    decisionRefs: [reference],
  };
}
export function writeBrowserDecisionFixture(directory: string): BrowserDecisionFixture {
  const selected = decision();
  const bytes = `${canonical({ schema: 'decision-graph-v1', decisions: [selected] })}\n`;
  writeFileSync(join(directory, '.omd', 'decision-graph.json'), bytes);
  return Object.freeze({
    evidence(entries: readonly BrowserFixtureEntry[]): BrowserEvidence {
      const observations = entries.map((entry) => {
        const core = observation(entry, { decisionId: selected.id, decisionSha256: designDecisionSha256(selected) });
        return Object.freeze({ ...core, observationSha256: browserObservationSha256(core) });
      });
      return Object.freeze({ browserObservations: Object.freeze({ schema: BROWSER_OBSERVATION_SET_SCHEMA, decisionGraphSha256: sha256(bytes), observations: Object.freeze(observations) }) });
    },
  });
}
export function unknownBrowserDecisionEvidence(directory: string, capture: BrowserFixtureCapture): BrowserEvidence {
  const graphBytes = readFileSync(join(directory, '.omd', 'decision-graph.json'));
  const core = observation({ ...capture, testedState: 'unknown-decision-test' }, { decisionId: 'unknown-decision', decisionSha256: sha256('unknown-decision') });
  return { browserObservations: { schema: BROWSER_OBSERVATION_SET_SCHEMA, decisionGraphSha256: sha256(graphBytes), observations: [{ ...core, observationSha256: browserObservationSha256(core) }] } };
}
