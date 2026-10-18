import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { browserTaskOutcomeContract } from '../brief/task-outcome.ts';
import { finalReviewResponseContract } from './final-review-response-contract.ts';
import { currentDeveloperCalibration } from '../coach/developer-calibration.ts';

import { validateFinalBrowserObservations } from '../evidence/final-v2-browser-observations.ts';
import { adaptiveBlindLaneContract } from '../evidence/final-v2-adaptive-files.ts';
import { validateTrustedOutcomeEvidence } from '../evidence/final-v2-outcome-gate.ts';
import { DESIGN_QUALITY_AXES, DESIGN_QUALITY_AXIS_FLOORS } from '../evidence/final-v2-design-quality.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { hasPublishedTaskFlowBenchmark } from '../ref/reference-research.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import {
  validateBrowserObservationArtifacts,
  validateBrowserObservationDecisionLinks,
} from './browser-observation.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { observationV2Sha256, validateObservationV2, type ObservationV2 } from './observation.ts';
import {
  acquireProjectMutationLock,
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from './project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import { measuredFinalRenderPacket } from './trusted-measured-review.ts';
import { requiresMeasuredTerminal } from '../measure/review-policy.ts';
import { WORDS_TYPE_FLOW_REVIEW_CHECKLIST } from './reviewer-task-checklist.ts';

export const FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA =
  'adaptive-final-render-reviewer-packet-input-v1' as const;
export const FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA =
  'adaptive-final-render-reviewer-transport-v1' as const;
export const FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA =
  'adaptive-final-render-reviewer-handback-v1' as const;

/** Host-owned and identical for both final Eyes. Caller prose is never appended. */
export const FINAL_RENDER_REVIEWER_TASK = [
  'Judge the anonymous production render using only the supplied evidence and every supplied image.',
  'Assess every required verdict, critical floor, and independent design-quality axis across every supplied view and state.',
  'For v2 axes cite packet SHA and relevant current measurement IDs. A score cannot overrule deterministic RED or incomplete coverage.',
  'Do not infer source identity, chronology, authorship, implementation details, or a desired verdict.',
  'Copy outputContract.responseIdentity into your response unchanged, then copy fixedBindings and add the required judgments. laneSchema describes a downstream record, not your response schema.',
  'Fill responseTemplate according to responseSchema: verdicts use GREEN or RED, criticalFloors use numeric scores, findings are strings, and designQuality is the schema-tagged six-axis object with evidence from both viewports. Null template values are unanswered, never approval.',
  'Blind narrative concerns visible task purpose, information hierarchy and recovery guidance. Behavioral execution belongs to the protocol lane and source comparison belongs to the fidelity lane; their intentionally excluded evidence is not a blind-lane defect. Content below the fold is not itself failure: judge access, grouping and task fit for the actual content.',
  'For a task whose meaning spans a whole page, inspect the supplied content sequence and relationships, not just its entry screen or an attractive isolated region. Apply this only to that task scope. A still image can establish static appearance, not the meaning or operation of an entire video, loop or time-based demonstration; temporal outcome acceptance belongs to the protocol lane.',
  'Return exactly the embedded output contract.',
].join(' ') + ` ${WORDS_TYPE_FLOW_REVIEW_CHECKLIST}`;

const SHA256 = /^[a-f0-9]{64}$/;
const INPUT_KEYS = ['schema', 'observationSha256s'] as const;
const POINTER_PATH = '.omd/observation-v2.json';
const DESKTOP = Object.freeze({ viewport: 'desktop' as const, width: 1280, height: 900 });
const MOBILE = Object.freeze({ viewport: 'mobile' as const, width: 390, height: 844 });
const fs = nodeStableProjectFileSystem();

export type FinalRenderReviewerPacketInput = Readonly<{
  schema: typeof FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA;
  observationSha256s: readonly string[];
}>;

export type FinalRenderReviewerLaneSchema =
  | 'measured-blind-review-v1'
  | 'adaptive-blind-review-v2'
  | 'adaptive-blind-review-v3';

export type FinalRenderReviewerPacketReceipt = Readonly<{
  path: string;
  sha256: string;
  evidenceSha256: string;
  laneSchema: FinalRenderReviewerLaneSchema;
}>;

export class FinalRenderReviewerPacketError extends Error {
  override readonly name = 'FinalRenderReviewerPacketError';
  constructor(reason: string) { super(`FINAL_RENDER_REVIEWER_PACKET_INVALID:${reason}`); }
}

const fail = (reason: string): never => { throw new FinalRenderReviewerPacketError(reason); };
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function stableRead(root: string, path: string, label: string): Buffer {
  try {
    return readStableProjectFile({ root, path: resolve(root, path), label, fs });
  } catch { return fail(label); }
}

function parseInput(value: unknown): FinalRenderReviewerPacketInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== INPUT_KEYS.length
    || Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !INPUT_KEYS.includes(key as typeof INPUT_KEYS[number]))) {
    return fail('input-shape');
  }
  const input = value as Record<string, unknown>;
  if (input.schema !== FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA
    || !Array.isArray(input.observationSha256s)
    || input.observationSha256s.length === 0
    || input.observationSha256s.some((item) => typeof item !== 'string' || !SHA256.test(item))
    || new Set(input.observationSha256s).size !== input.observationSha256s.length) {
    return fail('input-values');
  }
  return Object.freeze({
    schema: FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA,
    observationSha256s: Object.freeze([...input.observationSha256s]) as readonly string[],
  });
}

function observation(root: string, sha256: string): Readonly<{ value: ObservationV2; bytes: Buffer }> {
  const bytes = stableRead(root, `.omd/observation-v2/sha256-${sha256}.json`, 'observation');
  if (hash(bytes) !== sha256) fail('observation-digest');
  let value: ObservationV2;
  try { value = validateObservationV2(JSON.parse(bytes.toString('utf8')) as unknown); }
  catch { return fail('observation-shape'); }
  if (observationV2Sha256(value) !== sha256 || !bytes.equals(Buffer.from(`${canonicalJson(value)}\n`))) {
    fail('observation-canonical');
  }
  return Object.freeze({ value, bytes });
}

function requireCurrentObservationTail(root: string, sha256: string): void {
  const bytes = stableRead(root, POINTER_PATH, 'observation-pointer');
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')) as unknown; } catch { return fail('observation-pointer'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).length !== 3
    || (value as Record<string, unknown>).schema !== 'observation-v2-pointer'
    || (value as Record<string, unknown>).sha256 !== sha256
    || (value as Record<string, unknown>).record !== `.omd/observation-v2/sha256-${sha256}.json`) {
    fail('observation-pointer');
  }
}

function fixedViewport(width: number, height: number): typeof DESKTOP | typeof MOBILE | undefined {
  if (width === DESKTOP.width && height === DESKTOP.height) return DESKTOP;
  if (width === MOBILE.width && height === MOBILE.height) return MOBILE;
  return undefined;
}

function packetPath(sha256: string): string {
  return `.omd/final-review/reviewer-packets/sha256-${sha256}.json`;
}

/**
 * Rebuilds the sole trusted initial-final visual packet from current production observations.
 * Raw paths, URLs, source identities, reference pixels, and implementation rationale are absent.
 */
export function finalRenderReviewerPacket(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  packetInput: unknown;
}>): Buffer {
  const root = realpathSync(input.root);
  const parsed = parseInput(input.packetInput);
  const route = readPersistedRoute(root, input.invocation);
  const routeSha256 = adaptiveRouteRecordSha256(route);
  const loaded = parsed.observationSha256s.map((sha256) => observation(root, sha256));
  let predecessor: string | null = null;
  loaded.forEach((item, index) => {
    if (item.value.predecessorSha256 !== predecessor
      || item.value.buildSha256 !== input.invocation.current.buildSha256) {
      fail(`observation-chain-${index}`);
    }
    predecessor = parsed.observationSha256s[index]!;
  });
  const terminalSha256 = parsed.observationSha256s.at(-1) ?? fail('terminal-observation');
  requireCurrentObservationTail(root, terminalSha256);
  const benchmarkRequired = route.gates.includes('greenfield-task-flow-benchmark')
    && hasPublishedTaskFlowBenchmark(root, route.sourceContractSha256);
  validateTrustedOutcomeEvidence({
    root,
    branch: 'adaptive-omission',
    required: true,
    invocation: input.invocation,
    expected: {
      routeSha256,
      sourceContractSha256: route.sourceContractSha256,
      sourceContract: route.sourceContract,
      buildSha256: input.invocation.current.buildSha256,
      entrySurfaceRequired: benchmarkRequired,
    },
    observations: loaded.map(({ value }) => value),
  });
  const decisionGraphBytes = stableRead(root, '.omd/decision-graph.json', 'decision-graph');
  const terminal = loaded.at(-1)?.value ?? fail('terminal-observation');
  let browser;
  try {
    browser = validateBrowserObservationDecisionLinks(terminal.evidence, decisionGraphBytes, true)!;
    validateBrowserObservationArtifacts(
      browser,
      (path) => stableRead(root, path, 'production-capture'),
      true,
    );
  } catch { return fail('production-capture'); }
  const observationBindings = validateFinalBrowserObservations(
    root,
    fs,
    loaded.map(({ value }) => value.evidence),
    parsed.observationSha256s,
  );
  const developerCalibration = currentDeveloperCalibration(root, input.invocation);
  if (requiresMeasuredTerminal(route) && developerCalibration === null) {
    return measuredFinalRenderPacket(root, input.invocation, parsed.observationSha256s);
  }
  const rows = browser.observations.flatMap((item) => {
    const viewport = fixedViewport(item.viewport.width, item.viewport.height);
    if (viewport === undefined) return [];
    const capture = item.observableResult.capture;
    const bound = observationBindings.some((binding) =>
      binding.observationSha256 === terminalSha256
      && binding.browserObservationSha256 === item.observationSha256
      && binding.captureSha256 === capture.sha256
      && binding.viewport === viewport.viewport
      && binding.state === item.testedState);
    if (!bound) fail('production-capture-binding');
    const bytes = stableRead(root, capture.path, 'production-capture');
    return [Object.freeze({
      observationSha256: terminalSha256,
      browserObservationSha256: item.observationSha256,
      captureSha256: capture.sha256,
      viewport: viewport.viewport,
      state: item.testedState,
      width: viewport.width,
      height: viewport.height,
      pngBase64: bytes.toString('base64'),
    })];
  }).sort((left, right) => left.viewport.localeCompare(right.viewport)
    || left.state.localeCompare(right.state) || left.captureSha256.localeCompare(right.captureSha256));
  if (!rows.some(({ viewport }) => viewport === 'desktop')
    || !rows.some(({ viewport }) => viewport === 'mobile')) fail('fixed-viewports');
  const adaptiveContract = adaptiveBlindLaneContract(route, benchmarkRequired);
  const laneSchema: FinalRenderReviewerLaneSchema = adaptiveContract.schema === 'adaptive-blind-review-v3'
    ? adaptiveContract.schema
    : 'adaptive-blind-review-v2';
  const verdictKeys = [...adaptiveContract.verdicts];
  const floorKeys = [...adaptiveContract.floors];
  const evidence = Object.freeze({
    schema: 'adaptive-final-render-reviewer-evidence-v1' as const,
    candidateAlias: `candidate-${hash(`final-render\0${terminalSha256}`).slice(0, 16)}`,
    context: Object.freeze({
      projectMode: route.projectMode,
      taskOutcome: browserTaskOutcomeContract(route.sourceContract.taskOutcome),
      designAxes: route.sourceContract.designAxes,
      requiredOutcomes: route.requiredOutcomes,
      prohibitedOutcomes: route.prohibitedOutcomes,
      developerCalibration,
    }),
    observationProjection: Object.freeze({
      schema: 'design-quality-observation-projection-v1' as const,
      observationSha256s: parsed.observationSha256s,
      observations: Object.freeze(rows.map(({
        pngBase64: _pngBase64,
        width: _width,
        height: _height,
        browserObservationSha256: _browserObservationSha256,
        ...row
      }) => row)),
    }),
    renders: Object.freeze(rows),
  });
  const evidenceSha256 = hash(Buffer.from(canonicalJson(evidence)));
  const fixedBindings = Object.freeze({
    observationSha256s: parsed.observationSha256s,
    routeSha256,
    buildSha256: input.invocation.current.buildSha256,
    briefSha256: input.invocation.current.briefSha256,
    browserSha256: hash(decisionGraphBytes),
    evidenceSha256,
  });
  const outputContract = Object.freeze({
    schema: FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA,
    lane: 'blindLane' as const,
    responseIdentity: Object.freeze({ schema: FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA, lane: 'blindLane' as const }),
    laneSchema,
    verdictKeys: Object.freeze(verdictKeys),
    criticalFloorKeys: Object.freeze(floorKeys),
    designQuality: Object.freeze({
      schema: 'design-quality-contract-v1' as const,
      axes: DESIGN_QUALITY_AXES,
      floors: DESIGN_QUALITY_AXIS_FLOORS,
    }),
    reviewerFields: Object.freeze([
      'schema', 'lane', 'verdicts', 'criticalFloors', 'designQuality',
      'observationSha256s', 'routeSha256',
      'buildSha256', 'briefSha256',
      'browserSha256', 'evidenceSha256', 'findings',
    ]),
    fixedBindings,
    ...finalReviewResponseContract({
      identity: { schema: FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA, lane: 'blindLane' },
      fixedBindings, verdictKeys, floorKeys, designQuality: true,
    }),
  });
  return Buffer.from(`${canonicalJson({
    schema: FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA,
    evidenceSha256,
    evidence,
    outputContract,
  })}\n`);
}

export function publishFinalRenderReviewerPacket(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
  writer: ProjectWriteAdapter;
  packetInput: unknown;
}>): FinalRenderReviewerPacketReceipt {
  const root = realpathSync(input.root);
  requireProjectWriteAdapterForInvocation(root, input.writer, input.invocation);
  const release = acquireProjectMutationLock(root, input.invocation);
  try {
    const bytes = finalRenderReviewerPacket({
      root,
      invocation: input.invocation,
      packetInput: input.packetInput,
    });
    const value = JSON.parse(bytes.toString('utf8')) as {
      evidenceSha256: string;
      outputContract: { laneSchema: FinalRenderReviewerLaneSchema };
    };
    const sha256 = hash(bytes);
    const path = packetPath(sha256);
    input.writer.writeContentAddressed(path, bytes);
    return Object.freeze({
      path,
      sha256,
      evidenceSha256: value.evidenceSha256,
      laneSchema: value.outputContract.laneSchema,
    });
  } finally {
    release();
  }
}
