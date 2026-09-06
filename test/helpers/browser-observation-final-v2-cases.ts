import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { ArtifactReceipt } from '../../core/evidence/final-v2-graph.ts';
import type { FinalEvidenceV2Manifest } from '../../core/evidence/final-v2.ts';
import { BrowserObservationDecisionLinkError } from '../../core/runtime/browser-observation.ts';
import { unknownBrowserDecisionEvidence } from './browser-observation-decision-links.ts';

type FinalObservationFixtureWrite = Readonly<{
  directory: string;
  name: string;
  evidence: unknown;
  input: FinalEvidenceV2Manifest;
}>;
export type FinalBrowserObservationHarness = Readonly<{
  createRoot(): string;
  cleanRoot(directory: string): void;
  manifest(directory: string): FinalEvidenceV2Manifest;
  writeObservation(request: FinalObservationFixtureWrite): ArtifactReceipt;
  publishInvalid(directory: string, input: FinalEvidenceV2Manifest): void;
  publish(directory: string, input: FinalEvidenceV2Manifest): string;
  check(directory: string): FinalEvidenceV2Manifest;
}>;

export function registerFinalBrowserObservationCases(harness: FinalBrowserObservationHarness): void {
  test('final publication requires every browser outcome to bind an exact known design decision before final pointer or lock mutation', () => {
    const rejected = (evidence: (directory: string) => unknown, expectedCode: 'MISSING_DECISION_LINK' | 'UNKNOWN_DESIGN_DECISION'): void => {
      const directory = harness.createRoot();
      try {
        const input = harness.manifest(directory);
        const replacement = harness.writeObservation({ directory, name: expectedCode.toLowerCase(), evidence: evidence(directory), input });
        const submitted: FinalEvidenceV2Manifest = { ...input, graph: { ...input.graph, observations: [replacement, ...input.graph.observations.slice(1)] } };
        assert.throws(
          () => harness.publishInvalid(directory, submitted),
          (error: unknown) => error instanceof BrowserObservationDecisionLinkError && error.code === expectedCode,
        );
        assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
        assert.equal(existsSync(join(directory, '.omd', '.final-evidence-v2.lock')), false);
      } finally { harness.cleanRoot(directory); }
    };
    rejected(() => ({}), 'MISSING_DECISION_LINK');
    rejected((directory) => unknownBrowserDecisionEvidence(directory, {
      path: 'beats-desktop.png',
      sha256: digest(readFileSync(join(directory, 'beats-desktop.png'))),
      viewport: { width: 1280, height: 900 },
    }), 'UNKNOWN_DESIGN_DECISION');
  });

  test('a valid observation-decision chain publishes and checker revalidates it', () => {
    const directory = harness.createRoot();
    try {
      const input = harness.manifest(directory);
      harness.publish(directory, input);
      assert.equal(harness.check(directory).graph.observations.length, 2);
      const graphPath = join(directory, '.omd', 'decision-graph.json');
      writeFileSync(graphPath, `${readFileSync(graphPath, 'utf8')}\n`);
      assert.throws(
        () => harness.check(directory),
        (error: unknown) => error instanceof BrowserObservationDecisionLinkError && error.code === 'STALE_DECISION_GRAPH',
      );
    } finally { harness.cleanRoot(directory); }
  });
}
function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
