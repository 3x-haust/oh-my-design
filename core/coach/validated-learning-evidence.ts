import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateDecisionGraph } from '../deliberation/contracts.ts';
import {
  BrowserObservationDecisionLinkError,
  validateBrowserObservationArtifacts,
  validateBrowserObservationDecisionLinks,
} from '../runtime/browser-observation.ts';
import { readStableProjectFile, StableProjectFileReadError } from '../runtime/stable-project-file.ts';
import { hasExactLearningDecisionBindings } from './validated-learning-binding.ts';
import {
  LearningPromotionError,
  type LearningPromotionDependencies,
  type LearningProposition,
  type LearningProvenance,
  type LearningValidation,
} from './validated-learning-contract.ts';

export type LearningEvidenceAssessment = Readonly<{
  provenance: LearningProvenance;
  mixedContext: boolean;
  boundDecisionScope: boolean;
}>;

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function fail(message: string): never {
  throw new LearningPromotionError('INVALID_BROWSER_EVIDENCE', message);
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => freeze(Reflect.get(value, key)));
    Object.freeze(value);
  }
  return value;
}
function stableBytes(path: string, label: string, dependencies: LearningPromotionDependencies): Buffer {
  try {
    return readStableProjectFile({
      root: dependencies.projectRoot,
      path: resolve(dependencies.projectRoot, path),
      label,
      fs: dependencies.fs,
    });
  } catch (error) {
    if (error instanceof StableProjectFileReadError) return fail(error.message);
    throw error;
  }
}
function referencedDecisionsAreBound(
  bytes: Uint8Array,
  refs: LearningProvenance['decisionRefs'],
  proposition: LearningProposition,
): boolean {
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return fail('learning decision graph is not JSON'); }
  const checked = validateDecisionGraph(parsed);
  const graph = checked.value;
  if (graph === undefined) return fail('learning decision graph is invalid');
  const decisions = new Map(graph.decisions.map((decision) => [decision.id, decision]));
  return refs.every((ref) => {
    const decision = decisions.get(ref.decisionId);
    return decision !== undefined && hasExactLearningDecisionBindings(decision, proposition);
  });
}
function matchesBrowserScope(testedUrl: string, testedState: string, width: number, height: number, proposition: LearningProposition): boolean {
  let route = '';
  try {
    const url = new URL(testedUrl);
    if (url.search === '') route = url.pathname;
  } catch { route = ''; }
  const scope = proposition.scope;
  return route === scope.route && testedState === scope.testedState
    && width === scope.viewport.width && height === scope.viewport.height;
}

export function assessLearningEvidence(
  item: LearningValidation,
  proposition: LearningProposition,
  dependencies: LearningPromotionDependencies,
): LearningEvidenceAssessment {
  try {
    const graphBytes = stableBytes(item.decisionGraphPath, `learning decision graph for ${item.runId}`, dependencies);
    const links = validateBrowserObservationDecisionLinks(item.browserEvidence, graphBytes, true);
    if (links === undefined || links.observations.length !== 1) return fail('each validation must bind exactly one browser observation');
    validateBrowserObservationArtifacts(links, (path) => stableBytes(path, `learning capture for ${item.runId}`, dependencies), true);
    const observation = links.observations[0];
    if (observation === undefined) return fail('browser observation is missing');
    const provenance = freeze<LearningProvenance>({
      runId: item.runId,
      contextId: item.contextId,
      outcome: item.outcome,
      observedAt: item.observedAt,
      decisionGraphPath: item.decisionGraphPath,
      decisionGraphSha256: sha(graphBytes),
      observationSha256: observation.observationSha256,
      capture: { ...observation.observableResult.capture },
      decisionRefs: observation.decisionRefs.map((ref) => ({ ...ref })),
    });
    return freeze({
      provenance,
      mixedContext: !matchesBrowserScope(observation.testedUrl, observation.testedState, observation.viewport.width, observation.viewport.height, proposition),
      boundDecisionScope: referencedDecisionsAreBound(graphBytes, provenance.decisionRefs, proposition),
    });
  } catch (error) {
    if (error instanceof LearningPromotionError) throw error;
    if (error instanceof BrowserObservationDecisionLinkError) return fail(`${error.code}: ${error.message}`);
    return fail('browser evidence could not be verified through stable project files');
  }
}
