import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFinalReviewerPublication } from '../../adapters/final-reviewer-publication.ts';
import { runPiReviewerLane } from '../../adapters/pi-reviewer-runtime.ts';
import { checkCompletionPublicationPrerequisites } from '../completion/publication.ts';
import { publishFinalEvidenceV2 } from '../evidence/final-v2.ts';
import { preflightFinalEvidenceGraph } from '../evidence/final-v2-publication-preflight.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { checkSlopFinalGraph, SLOP_REVIEW_POINTER } from '../slop/review.ts';
import { FINAL_RENDER_REVIEWER_TASK, finalRenderReviewerPacket } from './final-render-review.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { buildNativeFinalManifest, buildNativeMeasuredFinalDraft, currentNativeFinalObservations } from './native-final-manifest.ts';
import { loadReviewPolicy, requiresMeasuredTerminal } from '../measure/review-policy.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { checkMeasuredHandbackCitations, checkMeasuredHandbackShape, policyLane } from '../../adapters/measured-reviewer-publication.ts';
import { publishDeterministicProtocol, validateMeasuredTerminal } from '../evidence/final-v2-measured-terminal.ts';
import { measuredReviewerTask } from './trusted-review-profile.ts';
import { nativeFinalLanePacket, nativeFinalLaneTask } from './native-final-packet.ts';
import { checkNativeFinalReview } from './native-final-review-state.ts';
export { checkNativeFinalReview } from './native-final-review-state.ts';
import { authorizeNativePiPayload, getNativePiRun } from './native-pi-run.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter, replaceProjectFileAtomically } from './project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import { requireResolvedNativeReframe } from './native-reframe.ts';

type Lane = 'blindLane' | 'fidelityLane' | 'protocolLane';
type Descriptor = Readonly<{ path: string; sha256: string }>;
type ReviewInput = Readonly<{
  root: string; invocation: ProjectRunInvocation; signal?: AbortSignal;
  onProgress?: (event: Readonly<{ lane: Lane; state: 'started' | 'received' }>) => void;
}>;
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
/**
 * The reviewer's own reasons for a red verdict, said back with the refusal so the maker repairs what was seen instead of
 * digging them out of the attempt record.
 */
export function redAxes(roleResults: readonly unknown[]): string {
  const reasons = roleResults.flatMap(result => {
    try {
      const message = (result as { authority?: { receipt?: { finalMessage?: unknown } } }).authority?.receipt?.finalMessage;
      const handback = JSON.parse(String(message)) as {
        designQuality?: { axes?: { axis?: string; verdict?: string; criticalFailure?: unknown }[] };
        findings?: { axes?: unknown; visibleCondition?: unknown; observedCondition?: unknown; repairCriterion?: unknown }[];
      };
      const red = (handback.designQuality?.axes ?? []).filter(axis => axis.verdict === 'RED');
      const stated = red.filter(axis => typeof axis.criticalFailure === 'string' && axis.criticalFailure.trim())
        .map(axis => `${axis.axis}: ${String(axis.criticalFailure).slice(0, 240)}`);
      // A reviewer may put the reason in its findings instead: the condition it saw and what would repair it.
      const redNames = new Set(red.map(axis => axis.axis));
      const found = (Array.isArray(handback.findings) ? handback.findings : [])
        .map(finding => ({ ...finding, condition: finding.visibleCondition ?? finding.observedCondition }))
        .filter(finding => Array.isArray(finding.axes) && finding.axes.some(axis => redNames.has(String(axis))) && typeof finding.condition === 'string')
        .map(finding => `${(finding.axes as unknown[]).filter(axis => redNames.has(String(axis))).join('/')}: ${String(finding.condition).slice(0, 200)}`
          + (typeof finding.repairCriterion === 'string' ? ` Repair: ${finding.repairCriterion.slice(0, 160)}` : ''));
      return [...stated, ...found];
    } catch { return []; }
  });
  return reasons.length ? `. The reviewer marked red: ${[...new Set(reasons)].slice(0, 4).join('; ')}` : '';
}

export class NativeFinalPublicationError extends Error {
  override readonly name = 'NativeFinalPublicationError';
  constructor(reason: string) { super(`NATIVE_FINAL_PUBLICATION_FAILED:${reason}`); }
}
function packetLaneSchema(bytes: Buffer): string {
  const packet: unknown = JSON.parse(bytes.toString('utf8'));
  if (typeof packet !== 'object' || packet === null || !('outputContract' in packet)) throw new NativeFinalPublicationError('packet contract');
  const output = packet.outputContract;
  if (typeof output !== 'object' || output === null || !('laneSchema' in output) || typeof output.laneSchema !== 'string') throw new NativeFinalPublicationError('packet lane');
  return output.laneSchema;
}

export async function runNativeFinalReview(input: ReviewInput): Promise<Readonly<{
  pointer: string; lanes: Readonly<Partial<Record<Lane, Descriptor>>>; executions: readonly Descriptor[];
}>> {
  const run = getNativePiRun(input.invocation, input.root);
  const root = run.projectRoot;
  requireResolvedNativeReframe(root, input.invocation);
  const observationSha256s = currentNativeFinalObservations(root).map(({ receipt }) => receipt.sha256);
  const policy = loadReviewPolicy(root, input.invocation), measured = requiresMeasuredTerminal(readPersistedRoute(root, input.invocation));
  const writer = createProjectWriteAdapter(root, input.invocation);
  const draft = measured ? (() => {
    const activation = Buffer.from(canonicalJson(input.invocation.activation)), path = `.omd/activation/sha256-${hash(activation)}.json`;
    writer.writeContentAddressed(path, activation);
    return buildNativeMeasuredFinalDraft(root, input.invocation, path);
  })() : undefined;
  const protocol = draft ? publishDeterministicProtocol(root, draft.graph, writer, input.invocation) : undefined;
  const packetFor = (lane: Lane): Buffer => lane === 'blindLane'
    ? finalRenderReviewerPacket({ root, invocation: input.invocation,
      packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s } })
    : nativeFinalLanePacket({ root, invocation: input.invocation, observationSha256s, lane });
  const work = (['blindLane', 'fidelityLane', 'protocolLane'] as const).filter(lane => !measured || policy.lanes[policyLane(lane)] > 0).map((lane) => ({
    lane, packet: packetFor(lane), task: measured ? measuredReviewerTask(lane) : lane === 'blindLane' ? FINAL_RENDER_REVIEWER_TASK : nativeFinalLaneTask(lane),
  }));
  const pointer = '.omd/final-review/native-current.json';
  const pending = Buffer.from(canonicalJson({ schema: 'native-pi-final-review-pending-v1', runId: run.runId, nonce: randomUUID() }));
  authorizeNativePiPayload(input.invocation, root, 'final-reviewer-lane', pending);
  replaceProjectFileAtomically({ projectRoot: root, invocation: input.invocation, relativePath: pointer, content: pending });
  const outcomes = await Promise.allSettled(work.map(async (item) => {
    input.onProgress?.({ lane: item.lane, state: 'started' });
    const roleResults = await runPiReviewerLane({ root, invocation: input.invocation, ...item,
      ...(measured ? { validateHandback: (final: string) => {
        checkMeasuredHandbackShape(final, item.packet);
        checkMeasuredHandbackCitations(final, item.packet, root, input.invocation);
      } } : {}),
      ...(input.signal === undefined ? {} : { signal: input.signal }) });
    input.onProgress?.({ lane: item.lane, state: 'received' });
    return { ...item, roleResults };
  }));
  const results = outcomes.flatMap(outcome => outcome.status === 'fulfilled' ? [outcome.value] : []);
  const attempt = Buffer.from(canonicalJson({ schema: 'native-pi-final-review-attempt-v1', runId: run.runId,
    results: results.map(({ lane, roleResults }) => ({ lane, roleResults })),
    failures: outcomes.flatMap((outcome, index) => outcome.status === 'rejected'
      ? [{ lane: work[index]?.lane, reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) }] : []),
  }));
  const attemptPath = `.omd/final-review/attempts/sha256-${hash(attempt)}.json`;
  writer.writeContentAddressed(attemptPath, attempt);
  const reject = (reason: string): never => {
    const release = acquireProjectMutationLock(root, input.invocation);
    try {
      const current = readStableProjectFile({ root, path: resolve(root, pointer), label: 'pending reviewer owner', fs: nodeStableProjectFileSystem() });
      if (current.equals(pending)) {
        const bytes = Buffer.from(canonicalJson({ schema: 'native-pi-final-review-rejected-v1', runId: run.runId,
          attempt: { path: attemptPath, sha256: hash(attempt) }, reason }));
        authorizeNativePiPayload(input.invocation, root, 'final-reviewer-lane', bytes);
        replaceProjectFileAtomically({ projectRoot: root, invocation: input.invocation, relativePath: pointer, content: bytes });
      }
    } finally { release(); }
    throw new NativeFinalPublicationError(`${reason}; inspect ${attemptPath}`);
  };
  const failures = outcomes.filter(outcome => outcome.status === 'rejected');
  if (failures.length) reject(`review process failed: ${failures.map((outcome, index) => {
    const lane = work[outcomes.indexOf(outcome)]?.lane ?? `lane-${index}`;
    const reason = outcome.status === 'rejected'
      ? outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      : 'unknown';
    return `${lane}: ${reason}`;
  }).join('; ')}`);
  input.signal?.throwIfAborted();
  const release = acquireProjectMutationLock(root, input.invocation);
  try {
    const current = readStableProjectFile({ root, path: resolve(root, pointer), label: 'pending reviewer owner', fs: nodeStableProjectFileSystem() });
    if (!current.equals(pending)) throw new NativeFinalPublicationError('review superseded by a newer execution');
    const publications = results.map(({ lane, packet, roleResults }) => {
      if (!packet.equals(packetFor(lane))) return reject('evidence changed during review');
      try {
        return { lane, publication: buildFinalReviewerPublication({ schema: 'adaptive-final-review-publication-v1',
          laneSchema: packetLaneSchema(packet), roleResults }, { projectRoot: root, invocation: input.invocation,
          buildSha256: run.buildSha256, briefSha256: run.briefSha256 }) };
      } catch (error) {
        if (error instanceof Error) return reject(`${lane}: ${error.message}${redAxes(roleResults)}`);
        throw error;
      }
    });
    for (const { publication } of publications) {
      for (const artifact of [...publication.executions, ...publication.artifacts ?? [], publication.lane]) {
        authorizeNativePiPayload(input.invocation, root, 'final-reviewer-lane', artifact.bytes);
        writer.writeContentAddressed(artifact.path, artifact.bytes);
      }
    }
    const descriptor = (name: Lane): Descriptor => {
      const item = publications.find(({ lane }) => lane === name)?.publication.lane;
      if (!item) throw new NativeFinalPublicationError('missing completed lane');
      return { path: item.path, sha256: item.sha256 };
    };
    const lanes = Object.fromEntries(work.map(({ lane }) => [lane, descriptor(lane)]));
    if (!draft?.graph.measuredTerminal || !protocol) return reject('measured terminal review state is required');
    const measuredTerminal = { ...draft.graph.measuredTerminal, deterministicProtocol: protocol, lanes };
    validateMeasuredTerminal(root, { ...draft.graph, measuredTerminal }, input.invocation);
    const bytes = Buffer.from(canonicalJson({ schema: 'native-pi-final-review-v2', runId: run.runId,
      buildSha256: run.buildSha256, briefSha256: run.briefSha256, measuredTerminal,
      attempt: { path: attemptPath, sha256: hash(attempt) } }));
    authorizeNativePiPayload(input.invocation, root, 'final-reviewer-lane', bytes);
    replaceProjectFileAtomically({ projectRoot: root, invocation: input.invocation, relativePath: pointer, content: bytes });
    return { pointer, lanes, executions: publications.flatMap(({ publication }) => publication.executions.map(({ path, sha256 }) => ({ path, sha256 }))) };
  } finally { release(); }
}

export function finalizeNativeEvidence(input: Readonly<{ root: string; invocation: ProjectRunInvocation }>): Readonly<{ path: string }> {
  const run = getNativePiRun(input.invocation, input.root);
  const root = run.projectRoot;
  requireResolvedNativeReframe(root, input.invocation);
  checkNativeFinalReview(input);
  const activation = Buffer.from(canonicalJson(input.invocation.activation));
  const activationPath = `.omd/activation/sha256-${hash(activation)}.json`;
  createProjectWriteAdapter(root, input.invocation).writeContentAddressed(activationPath, activation);
  const manifest = buildNativeFinalManifest(root, input.invocation, activationPath);
  const fs = nodeStableProjectFileSystem();
  preflightFinalEvidenceGraph({ root, graph: manifest.graph, fs, invocation: input.invocation });
  checkCompletionPublicationPrerequisites(root, manifest, input.invocation);
  // A published slop ledger can inform repair, but its inventory/dispositions are
  // advisory. The independent browser-bound final-v2 visual floors remain hard.
  if (existsSync(resolve(root, SLOP_REVIEW_POINTER))) {
    try { checkSlopFinalGraph(root, manifest.graph); }
    catch (error) { process.emitWarning(`optional slop review needs attention: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const path = publishFinalEvidenceV2(root, manifest, input.invocation,
    bytes => authorizeNativePiPayload(input.invocation, root, 'final-evidence-manifest', bytes));
  const pointer = readStableProjectFile({ root, path: resolve(root, path), label: 'published final pointer', fs });
  authorizeNativePiPayload(input.invocation, root, 'final-reviewer-lane', pointer);
  return { path };
}
