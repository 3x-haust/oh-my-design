import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  contentGrainSha256,
  validateContentFitCoverage,
  type ContentFitObservationBinding,
  type ContentFitReceipt,
} from '../content-grain/contract.ts';
import { readContentFitReceipt, readContentGrain } from '../content-grain/files.ts';
import { validateDecisionGraph } from '../deliberation/contracts.ts';
import {
  validateBrowserObservationDecisionLinks,
  type BrowserObservation,
} from '../runtime/browser-observation.ts';

export type FinalV2ContentFitErrorCode =
  | 'CONTENT_FIT_REQUIRED'
  | 'CONTENT_FIT_FORBIDDEN'
  | 'CONTENT_FIT_DESCRIPTOR_STALE'
  | 'CONTENT_FIT_DECISION_GRAPH_INVALID'
  | 'CONTENT_FIT_OBSERVATION_VIEWPORT_MISMATCH';

export class FinalV2ContentFitError extends Error {
  override readonly name = 'FinalV2ContentFitError';
  readonly code: FinalV2ContentFitErrorCode;
  constructor(code: FinalV2ContentFitErrorCode) { super(code); this.code = code; }
}

export type FinalV2ContentFitInput = Readonly<{
  root: string;
  route: Readonly<{ strategy: Readonly<{ stages: readonly string[] }> }>;
  contentFit?: Readonly<{ path: string; schema: string; sha256: string }>;
  observations: readonly unknown[];
}>;

const hash = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const fail = (code: FinalV2ContentFitErrorCode): never => { throw new FinalV2ContentFitError(code); };
const expectedViewport = (viewport: 'desktop' | 'mobile'): Readonly<{ width: number; height: number }> =>
  viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 };

function currentDecisionGraph(root: string): Readonly<{
  bytes: Buffer;
  decisions: ReadonlyMap<string, readonly string[]>;
}> {
  const bytes = readFileSync(resolve(root, '.omd', 'decision-graph.json'));
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return fail('CONTENT_FIT_DECISION_GRAPH_INVALID'); }
  const graph = validateDecisionGraph(value).value ?? fail('CONTENT_FIT_DECISION_GRAPH_INVALID');
  return {
    bytes,
    decisions: new Map(graph.decisions.map((decision) => [decision.id, decision.evidence])),
  };
}

function observationBindings(
  evidence: readonly unknown[],
  decisionGraph: ReturnType<typeof currentDecisionGraph>,
): Readonly<{
  coverage: readonly ContentFitObservationBinding[];
  observations: ReadonlyMap<string, BrowserObservation>;
}> {
  const observations = new Map<string, BrowserObservation>();
  const coverage = new Map<string, ContentFitObservationBinding>();
  for (const item of evidence) {
    const set = validateBrowserObservationDecisionLinks(item, decisionGraph.bytes, true);
    if (set === undefined) continue;
    for (const observation of set.observations) {
      const decisionRefs = observation.decisionRefs.flatMap((reference) =>
        decisionGraph.decisions.get(reference.decisionId) ?? [],
      ).filter((reference) => reference.startsWith('content-grain:'));
      observations.set(observation.observationSha256, observation);
      coverage.set(observation.observationSha256, {
        sha256: observation.observationSha256,
        decisionRefs: Object.freeze([...new Set(decisionRefs)]),
      });
    }
  }
  return { coverage: Object.freeze([...coverage.values()]), observations };
}

export function validateFinalV2ContentFitCurrentness(
  input: FinalV2ContentFitInput,
): ContentFitReceipt | undefined {
  const selected = input.route.strategy.stages.includes('content-grain');
  if (!selected) {
    if (input.contentFit !== undefined) fail('CONTENT_FIT_FORBIDDEN');
    return undefined;
  }
  const descriptor = input.contentFit ?? fail('CONTENT_FIT_REQUIRED');
  if (descriptor.path !== '.omd/content-fit.json' || descriptor.schema !== 'content-fit-receipt-v1') {
    fail('CONTENT_FIT_DESCRIPTOR_STALE');
  }
  const receipt = readContentFitReceipt(input.root);
  const bytes = readFileSync(resolve(input.root, descriptor.path));
  if (hash(bytes) !== descriptor.sha256) fail('CONTENT_FIT_DESCRIPTOR_STALE');
  const grain = readContentGrain(input.root);
  const decisionGraph = currentDecisionGraph(input.root);
  const bindings = observationBindings(input.observations, decisionGraph);
  for (const check of receipt.checks) {
    const observation = bindings.observations.get(check.observationSha256);
    const viewport = expectedViewport(check.viewport);
    if (observation === undefined
      || observation.viewport.width !== viewport.width
      || observation.viewport.height !== viewport.height) {
      fail('CONTENT_FIT_OBSERVATION_VIEWPORT_MISMATCH');
    }
  }
  validateContentFitCoverage({
    grain,
    grainSha256: contentGrainSha256(grain),
    decisionGraphSha256: hash(decisionGraph.bytes),
    receipt,
    observations: bindings.coverage,
  });
  return receipt;
}
