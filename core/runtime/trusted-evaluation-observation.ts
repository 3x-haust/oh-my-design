import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { validateDecisionGraph } from '../deliberation/contracts.ts';
import {
  BROWSER_OBSERVATION_SCHEMA,
  BROWSER_OBSERVATION_SET_SCHEMA,
  browserObservationSha256,
  designDecisionSha256,
  type BrowserObservationCore,
} from './browser-observation.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import {
  parseTrustedBrowserReceipt,
  trustedBrowserReceiptSha256,
  type TrustedBrowserReceipt,
} from './trusted-browser-receipt.ts';
import {
  requireTrustedBrowserEvaluation,
  type TrustedBrowserEvaluationResult,
} from '../../adapters/trusted-browser-runner.ts';
import { writeObservationV2, type ObservationV2 } from './observation.ts';
import type { ProjectWriteAdapter } from './project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';

export type TrustedEvaluationObservationErrorCode =
  | 'STALE_TRUSTED_BROWSER_CAPTURE'
  | 'STALE_TRUSTED_PRODUCTION_REVISION'
  | 'STALE_TRUSTED_ACTIVATION_BUILD'
  | 'STALE_TRUSTED_BROWSER_DECISION_GRAPH'
  | 'TRUSTED_ARTIFACT_OUTSIDE_PROJECT';

export class TrustedEvaluationObservationError extends Error {
  readonly code: TrustedEvaluationObservationErrorCode;

  constructor(code: TrustedEvaluationObservationErrorCode) {
    super(code);
    this.name = 'TrustedEvaluationObservationError';
    this.code = code;
  }
}

const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const STABLE_FS = nodeStableProjectFileSystem();

function projectPath(root: string, path: string): string {
  const target = resolve(root, path);
  const rel = relative(resolve(root), target);
  if (rel === '' || rel.startsWith('..') || rel.includes('\\')) {
    throw new TrustedEvaluationObservationError('TRUSTED_ARTIFACT_OUTSIDE_PROJECT');
  }
  return target;
}

function stableBytes(root: string, path: string, label: string): Buffer {
  return readStableProjectFile({
    root,
    path: projectPath(root, path),
    label,
    fs: STABLE_FS,
  });
}

function verifyCapture(root: string, capture: TrustedBrowserReceipt['captures'][number]): void {
  let bytes: Buffer;
  try {
    bytes = stableBytes(root, capture.path, 'trusted browser capture');
  } catch {
    throw new TrustedEvaluationObservationError('STALE_TRUSTED_BROWSER_CAPTURE');
  }
  if (hash(bytes) !== capture.sha256) {
    throw new TrustedEvaluationObservationError('STALE_TRUSTED_BROWSER_CAPTURE');
  }
}

export function writeTrustedEvaluationObservation(input: Readonly<{
  root: string;
  writer: ProjectWriteAdapter;
  invocation: ProjectRunInvocation;
  evaluation: TrustedBrowserEvaluationResult;
  currentArtifactPath: string;
  productionArtifactPath: string;
  requireDecisionGraph?: boolean;
}>): ObservationV2 {
  const evaluation = requireTrustedBrowserEvaluation(input.evaluation);
  const receipt = parseTrustedBrowserReceipt(evaluation.receipt);
  if (trustedBrowserReceiptSha256(receipt) !== evaluation.receiptSha256) {
    throw new Error('UNAUTHORIZED_TRUSTED_BROWSER_RECEIPT');
  }
  if (receipt.activationBuildSha256 !== input.invocation.current.buildSha256) {
    throw new TrustedEvaluationObservationError('STALE_TRUSTED_ACTIVATION_BUILD');
  }
  if (servedProjectTreeSha256(input.root, input.productionArtifactPath)
    !== receipt.productionRevisionSha256) {
    throw new TrustedEvaluationObservationError('STALE_TRUSTED_PRODUCTION_REVISION');
  }
  for (const capture of receipt.captures) verifyCapture(input.root, capture);
  const currentArtifactBytes = stableBytes(input.root, input.currentArtifactPath, 'trusted build artifact');
  const receiptSha256 = trustedBrowserReceiptSha256(receipt);
  input.writer.writeContentAddressed(
    `.omd/trusted-browser-receipt-sha256-${receiptSha256}.json`,
    `${canonicalJson(receipt)}\n`,
  );
  const transcriptSha256 = hash(Buffer.from(canonicalJson(receipt.transcript)));
  let browserEvidence: Readonly<Record<string, unknown>> = {};
  try {
    const decisionGraphBytes = stableBytes(
      input.root,
      '.omd/decision-graph.json',
      'trusted lifecycle decision graph',
    );
    const graph = validateDecisionGraph(JSON.parse(decisionGraphBytes.toString('utf8')) as unknown);
    if (graph.value === undefined) {
      throw new TrustedEvaluationObservationError('STALE_TRUSTED_BROWSER_DECISION_GRAPH');
    }
    const decisionRefs = graph.value.decisions.map((decision) => ({
      decisionId: decision.id,
      decisionSha256: designDecisionSha256(decision),
    }));
    const browserObservations = receipt.captures.map((capture) => {
      const core: BrowserObservationCore = {
        schema: BROWSER_OBSERVATION_SCHEMA,
        testedUrl: receipt.testedUrl,
        testedState: capture.outcomeRef === undefined
          ? 'trusted-evaluation'
          : `outcome-${hash(Buffer.from(capture.outcomeRef)).slice(0, 16)}`,
        viewport: { width: capture.width, height: capture.height },
        observableResult: {
          kind: 'screenshot',
          capture: { path: capture.path, sha256: capture.sha256 },
          result: {
            measurement: 'viewport-pixels',
            width: capture.width,
            height: capture.height,
          },
        },
        decisionRefs,
      };
      return Object.freeze({ ...core, observationSha256: browserObservationSha256(core) });
    });
    browserEvidence = {
      browserObservations: {
        schema: BROWSER_OBSERVATION_SET_SCHEMA,
        decisionGraphSha256: hash(decisionGraphBytes),
        observations: browserObservations,
      },
    };
  } catch (error) {
    if (input.requireDecisionGraph === true) throw error;
  }
  return writeObservationV2(input.root, {
    currentArtifact: {
      path: input.currentArtifactPath,
      sha256: hash(currentArtifactBytes),
    },
    buildSha256: input.invocation.current.buildSha256,
    evidence: {
      trustedOutcome: {
        schema: 'trusted-outcome-observation-v1',
        receiptSha256,
        routeSha256: receipt.routeSha256,
        sourceContractSha256: receipt.sourceContractSha256,
        activationBuildSha256: receipt.activationBuildSha256,
        productionRevisionSha256: receipt.productionRevisionSha256,
        outcomeResults: receipt.outcomeResults,
        confirmedClaimRefs: receipt.confirmedClaimRefs,
        decisionRefs: receipt.decisionRefs,
        hardFloors: receipt.hardFloors,
        captureSha256s: receipt.captures.map((capture) => capture.sha256),
        transcriptSha256,
        ...(receipt.entrySurface === undefined ? {} : { entrySurface: receipt.entrySurface }),
      },
      ...browserEvidence,
    },
  }, input.writer, input.invocation);
}
