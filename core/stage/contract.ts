// Stage state for a design run.
//
// The loop already owns each durable artifact; what it lacked was a machine-readable answer to
// "which stage am I in, what did an earlier owner already produce, and which contracts were
// actually handed to the role that needs them". A long run that compacts its context, or a run
// that died mid-stage, otherwise restarts at the domain brief and rewrites owned artifacts.
//
// State is derived from the artifacts on disk. The one fact that cannot be derived is delivery:
// whether a contract's exact bytes reached the stage that must obey them. That is the only thing
// this module persists, append-only, in `.omd/delivery.jsonl`.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPersistedRoute } from '../route/index.ts';
import { unconfirmedPlanningStatements, validateDomainBrief } from '../domain/domain-brief.ts';
import { ADAPTIVE_STAGE_GRAPH, type AdaptiveStageId } from '../route/adaptive-stage-graph.ts';
import { CANDIDATE_SELECTION_POINTER_PATH } from '../brief/candidate-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { consumedContractText } from './contract-sections.ts';
import { canDeferMissingCopy, DEBT_CAPABLE_STAGES } from '../brief/confidence-debt.ts';

export const DELIVERY_RECEIPT_SCHEMA = 'stage-delivery-v1' as const;
export const DELIVERY_LOG = '.omd/delivery.jsonl';

export type StageId =
  | 'domain' | 'depth' | 'frame' | 'content-grain' | 'acquisition' | 'scout' | 'moodboard'
  | 'reference-board'
  | 'reference-selection' | 'art-direction' | 'copy' | 'type-proof' | 'composition' | 'candidate-generation';

export type StageDefinition = {
  readonly id: StageId;
  /** The work owner; coordinator-owned CLI publication remains a separate declared handoff. */
  readonly owner: string;
  /** Project-relative output entry point; its presence still requires current output validation. */
  readonly artifact: string;
  /** Pack-relative contracts this stage's owner must receive before it runs. */
  readonly requiredContracts: readonly string[];
};

export const STAGES: readonly StageDefinition[] = Object.freeze([
  { id: 'domain', owner: 'coordinator', artifact: '.omd/domain-brief.json', requiredContracts: ['protocol/domain-analysis.md'] },
  { id: 'depth', owner: 'coordinator', artifact: '.omd/depth.json', requiredContracts: ['protocol/design-deliberation.md'] },
  { id: 'frame', owner: 'omd-framer', artifact: '.omd/frame.md', requiredContracts: ['protocol/human-design-loop.md', 'theory/ux.md'] },
  { id: 'content-grain', owner: 'omd-framer', artifact: '.omd/content-grain.json', requiredContracts: ['protocol/content-grain.md'] },
  { id: 'acquisition', owner: 'omd-framer', artifact: '.omd/acquisition-plan.json', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'scout', owner: 'omd-scout', artifact: '.omd/scout.md', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'reference-board', owner: 'omd-scout', artifact: '.omd/reference-board.json', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'moodboard', owner: 'omd-scout', artifact: '.omd/moodboard.json', requiredContracts: ['protocol/reference-assembly.md', 'protocol/moodboard.md'] },
  { id: 'reference-selection', owner: 'coordinator', artifact: '.omd/reference-pre-selection-v2.json', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'art-direction', owner: 'coordinator', artifact: '.omd/art-direction.json', requiredContracts: ['protocol/design-deliberation.md'] },
  { id: 'copy', owner: 'omd-writer', artifact: '.omd/copy-deck.md', requiredContracts: ['protocol/copy-deck.md', 'theory/voice.md'] },
  { id: 'type-proof', owner: 'omd-typesetter', artifact: '.omd/type-proof.md', requiredContracts: ['theory/typography.md'] },
  { id: 'composition', owner: 'omd-composer', artifact: '.omd/composition.md', requiredContracts: ['protocol/composition-contract.md', 'theory/layout.md'] },
  { id: 'candidate-generation', owner: 'omd-sketch', artifact: CANDIDATE_SELECTION_POINTER_PATH, requiredContracts: ['protocol/composition-contract.md', 'theory/layout.md'] },
].map((stage) => Object.freeze({ ...stage, requiredContracts: Object.freeze(stage.requiredContracts) })) as StageDefinition[]);

export type DeliveryReceipt = {
  readonly schema: typeof DELIVERY_RECEIPT_SCHEMA;
  readonly stage: StageId;
  readonly contract: string;
  readonly sha256: string;
  readonly at: string;
};

export type StageState = {
  readonly stage: StageId;
  readonly owner: string;
  readonly artifact: string;
  readonly present: boolean;
  /** Contracts whose exact current bytes have a receipt for this stage. */
  readonly delivered: readonly string[];
  readonly undelivered: readonly string[];
};

export type RunState = {
  readonly completed: readonly StageId[];
  readonly current: StageId | null;
  readonly stages: readonly StageState[];
};

export class StageError extends Error {}

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function stageDefinition(id: string): StageDefinition {
  const found = STAGES.find((stage) => stage.id === id);
  if (found === undefined) throw new StageError(`unknown stage ${id}; known: ${STAGES.map((stage) => stage.id).join(', ')}`);
  return found;
}

/** Strict lookup for delivery: handing over a contract that does not exist is a caller error. */
export function contractSha256(packRoot: string, contract: string, stage?: StageId): string {
  const current = currentContractSha256(packRoot, contract, stage);
  if (current === undefined) throw new StageError(`contract ${contract} does not exist under the knowledge pack`);
  return current;
}

/**
 * State resolution must survive a missing contract: an absent file leaves its stage blocked with a
 * named reason instead of collapsing the whole run state.
 */
function currentContractSha256(packRoot: string, contract: string, stage?: StageId): string | undefined {
  const path = join(packRoot, contract);
  if (!existsSync(path)) return undefined;
  const bytes = readFileSync(path);
  return digest(stage === undefined ? bytes : Buffer.from(consumedContractText(bytes.toString('utf8'), contract, stage)));
}

export function readDeliveryReceipts(projectRoot: string): readonly DeliveryReceipt[] {
  const path = join(projectRoot, DELIVERY_LOG);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      let value: unknown;
      try { value = JSON.parse(line); } catch { throw new StageError(`delivery log line ${index + 1} is not JSON`); }
      return validateDeliveryReceipt(value);
    });
}

export function validateDeliveryReceipt(value: unknown): DeliveryReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new StageError('delivery receipt must be an object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'at,contract,schema,sha256,stage') throw new StageError('delivery receipt has unknown or missing keys');
  if (record.schema !== DELIVERY_RECEIPT_SCHEMA) throw new StageError(`delivery receipt schema must be ${DELIVERY_RECEIPT_SCHEMA}`);
  if (typeof record.contract !== 'string' || record.contract === '') throw new StageError('delivery receipt needs a contract path');
  if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new StageError('delivery receipt needs a SHA-256 digest');
  if (typeof record.at !== 'string' || !Number.isFinite(Date.parse(record.at))) throw new StageError('delivery receipt needs an ISO timestamp');
  return { schema: DELIVERY_RECEIPT_SCHEMA, stage: stageDefinition(String(record.stage)).id, contract: record.contract, sha256: record.sha256, at: record.at };
}

/**
 * New receipts bind consumed sections. Legacy whole-file receipts remain readable, but cannot
 * gain semantic freshness retroactively; redeliver once to migrate their binding.
 */
function routedStages(projectRoot: string, invocation?: ProjectRunInvocation): readonly StageDefinition[] {
  const path = join(projectRoot, '.omd', 'route.json');
  if (!existsSync(path)) return STAGES;
  let routed: ReturnType<typeof readPersistedRoute>;
  try {
    routed = readPersistedRoute(projectRoot, invocation ?? failStageAuthority());
  } catch (error) {
    throw new StageError(`adaptive route record is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const definitions = new Map<string, StageDefinition>(STAGES.map((stage) => [stage.id, stage]));
  return routed.strategy.stages.flatMap((stage) => {
    const definition = definitions.get(stage);
    return definition === undefined ? [] : [definition];
  });
}

function failStageAuthority(): never {
  throw new StageError('adaptive route authority is required');
}

export function resolveRunState(
  projectRoot: string,
  packRoot: string,
  invocation?: ProjectRunInvocation,
): RunState {
  const receipts = readDeliveryReceipts(projectRoot);
  const stages = routedStages(projectRoot, invocation).map((stage) => {
    const delivered: string[] = [];
    const undelivered: string[] = [];
    for (const contract of stage.requiredContracts) {
      const current = currentContractSha256(packRoot, contract, stage.id);
      const legacy = currentContractSha256(packRoot, contract);
      const fresh = current !== undefined && receipts.some((receipt) => receipt.stage === stage.id && receipt.contract === contract && (receipt.sha256 === current || receipt.sha256 === legacy));
      (fresh ? delivered : undelivered).push(contract);
    }
    return {
      stage: stage.id,
      owner: stage.owner,
      artifact: stage.artifact,
      present: existsSync(join(projectRoot, stage.artifact)),
      delivered,
      undelivered,
    };
  });
  const completed = stages.filter((stage) => stage.present).map((stage) => stage.stage);
  return { completed, current: stages.find((stage) => !stage.present)?.stage ?? null, stages };
}

export function deliveryReceipt(stage: StageId, contract: string, sha256: string, at: string): DeliveryReceipt {
  return { schema: DELIVERY_RECEIPT_SCHEMA, stage: stageDefinition(stage).id, contract, sha256, at };
}

export function serializeDeliveryLog(receipts: readonly DeliveryReceipt[]): string {
  return `${receipts.map((receipt) => JSON.stringify(receipt)).join('\n')}\n`;
}

export type StageRequirement = {
  readonly stage: StageId;
  readonly ok: boolean;
  readonly missingArtifacts: readonly string[];
  readonly undeliveredContracts: readonly string[];
};

/**
 * Adaptive routes may put independent owners in one execution wave. The stage graph, rather than
 * route listing order, is the producer contract for that mode; return its selected transitive
 * prerequisites so a consumer cannot outrun a real dependency while same-wave peers stay runnable.
 */
export function adaptivePrerequisiteStages(
  projectRoot: string,
  invocation: ProjectRunInvocation,
  stage: AdaptiveStageId,
): readonly AdaptiveStageId[] | undefined {
  if (!existsSync(join(projectRoot, '.omd', 'route.json'))) return undefined;
  const route = readPersistedRoute(projectRoot, invocation);
  const selected = new Set(route.strategy.stages);
  const dependencies = new Set<AdaptiveStageId>();
  const visit = (current: AdaptiveStageId): void => {
    const node = ADAPTIVE_STAGE_GRAPH[current];
    // Greenfield copy consumes Framer's reality ledger even when Copy and Scout share a wave.
    // Keep this conditional: existing copy-only routes intentionally have no frame stage.
    const greenfieldCopyFrame = current === 'copy' && route.projectMode === 'greenfield' ? ['frame' as const] : [];
    for (const dependency of [...node.prerequisites, ...node.afterIfSelected, ...greenfieldCopyFrame]) {
      if (!selected.has(dependency) || dependencies.has(dependency)) continue;
      dependencies.add(dependency);
      visit(dependency);
    }
  };
  visit(stage as AdaptiveStageId);
  return [...dependencies];
}

/**
 * The gate a stage runs before its owner is spawned. It fails on the two conditions a long run
 * cannot detect for itself: an earlier owner never produced its artifact, and a contract this
 * stage must obey was never delivered with its current bytes.
 */
/**
 * Planning intent is the one input search cannot supply, so a run that reaches production with an
 * unresolved hypothesis would ship a business goal nobody stated. This is the check production runs.
 */
export function requireConfirmedPlanningForProduction(projectRoot: string): readonly string[] {
  const path = join(projectRoot, '.omd', 'domain-brief.json');
  if (!existsSync(path)) return [];
  return unconfirmedPlanningStatements(validateDomainBrief(JSON.parse(readFileSync(path, 'utf8'))).planning);
}

export function requireStage(
  projectRoot: string,
  packRoot: string,
  id: string,
  invocation?: ProjectRunInvocation,
): StageRequirement {
  const definition = stageDefinition(id);
  const state = resolveRunState(projectRoot, packRoot, invocation);
  const index = state.stages.findIndex((stage) => stage.stage === definition.id);
  if (index < 0) throw new StageError(`stage ${definition.id} is not selected by the adaptive route`);
  const adaptiveDependencies = invocation === undefined
    ? undefined
    : adaptivePrerequisiteStages(projectRoot, invocation, definition.id);
  const provisionalCopy = invocation !== undefined && adaptiveDependencies !== undefined
    && canDeferMissingCopy(readPersistedRoute(projectRoot, invocation));
  const missingArtifacts = adaptiveDependencies === undefined
    ? state.stages.slice(0, index).filter((stage) => !stage.present).map((stage) => stage.artifact)
    : adaptiveDependencies
      .map((dependency) => state.stages.find((stage) => stage.stage === dependency))
      .filter((stage): stage is StageState => stage !== undefined && !stage.present && !DEBT_CAPABLE_STAGES.has(stage.stage) && !(stage.stage === 'copy' && provisionalCopy))
      .map((stage) => stage.artifact);
  const undeliveredContracts = state.stages[index]!.undelivered;
  return { stage: definition.id, ok: missingArtifacts.length === 0 && undeliveredContracts.length === 0, missingArtifacts, undeliveredContracts };
}
