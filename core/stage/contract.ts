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

export const DELIVERY_RECEIPT_SCHEMA = 'stage-delivery-v1' as const;
export const DELIVERY_LOG = '.omd/delivery.jsonl';

export type StageId =
  | 'domain' | 'depth' | 'frame' | 'acquisition' | 'scout' | 'reference-board'
  | 'reference-selection' | 'art-direction' | 'copy' | 'type-proof' | 'composition';

export type StageDefinition = {
  readonly id: StageId;
  /** The role that writes the artifact; the coordinator never substitutes for a named owner. */
  readonly owner: string;
  /** Project-relative artifact whose existence proves the stage produced its output. */
  readonly artifact: string;
  /** Pack-relative contracts this stage's owner must receive before it runs. */
  readonly requiredContracts: readonly string[];
};

export const STAGES: readonly StageDefinition[] = Object.freeze([
  { id: 'domain', owner: 'coordinator', artifact: '.omd/domain-brief.json', requiredContracts: ['protocol/domain-analysis.md'] },
  { id: 'depth', owner: 'coordinator', artifact: '.omd/depth.json', requiredContracts: ['protocol/design-deliberation.md'] },
  { id: 'frame', owner: 'omd-framer', artifact: '.omd/frame.md', requiredContracts: ['protocol/human-design-loop.md', 'theory/ux.md'] },
  { id: 'acquisition', owner: 'omd-framer', artifact: '.omd/acquisition-plan.json', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'scout', owner: 'omd-scout', artifact: '.omd/scout.md', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'reference-board', owner: 'omd-scout', artifact: '.omd/reference-board.json', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'reference-selection', owner: 'coordinator', artifact: '.omd/reference-pre-selection-v2.json', requiredContracts: ['protocol/reference-assembly.md'] },
  { id: 'art-direction', owner: 'coordinator', artifact: '.omd/art-direction.json', requiredContracts: ['protocol/design-deliberation.md'] },
  { id: 'copy', owner: 'omd-writer', artifact: '.omd/copy-deck.md', requiredContracts: ['protocol/copy-deck.md', 'theory/voice.md'] },
  { id: 'type-proof', owner: 'omd-typesetter', artifact: '.omd/type-proof.md', requiredContracts: ['theory/typography.md'] },
  { id: 'composition', owner: 'omd-composer', artifact: '.omd/composition.md', requiredContracts: ['protocol/composition-contract.md', 'theory/layout.md'] },
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
export function contractSha256(packRoot: string, contract: string): string {
  const current = currentContractSha256(packRoot, contract);
  if (current === undefined) throw new StageError(`contract ${contract} does not exist under the knowledge pack`);
  return current;
}

/**
 * State resolution must survive a missing contract: an absent file leaves its stage blocked with a
 * named reason instead of collapsing the whole run state.
 */
function currentContractSha256(packRoot: string, contract: string): string | undefined {
  const path = join(packRoot, contract);
  return existsSync(path) ? digest(readFileSync(path)) : undefined;
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
 * A receipt only counts while the contract's bytes still match: an edited protocol invalidates the
 * handoff that quoted the old text, exactly like every other digest-bound record in the loop.
 */
export function resolveRunState(projectRoot: string, packRoot: string): RunState {
  const receipts = readDeliveryReceipts(projectRoot);
  const stages = STAGES.map((stage) => {
    const delivered: string[] = [];
    const undelivered: string[] = [];
    for (const contract of stage.requiredContracts) {
      const current = currentContractSha256(packRoot, contract);
      const fresh = current !== undefined && receipts.some((receipt) => receipt.stage === stage.id && receipt.contract === contract && receipt.sha256 === current);
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
 * The gate a stage runs before its owner is spawned. It fails on the two conditions a long run
 * cannot detect for itself: an earlier owner never produced its artifact, and a contract this
 * stage must obey was never delivered with its current bytes.
 */
export function requireStage(projectRoot: string, packRoot: string, id: string): StageRequirement {
  const definition = stageDefinition(id);
  const state = resolveRunState(projectRoot, packRoot);
  const index = STAGES.findIndex((stage) => stage.id === definition.id);
  const missingArtifacts = state.stages
    .slice(0, index)
    .filter((stage) => !stage.present)
    .map((stage) => stage.artifact);
  const undeliveredContracts = state.stages[index]!.undelivered;
  return { stage: definition.id, ok: missingArtifacts.length === 0 && undeliveredContracts.length === 0, missingArtifacts, undeliveredContracts };
}
