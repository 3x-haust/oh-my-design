// What a stage actually needs, assembled from this project's own state.
//
// OMD used to answer "what do I do now" with prose: a ~19k-token coordinator skill plus hundreds of
// imperative sentences. That layer rots. Every model release changes prompt guidance, and nobody can
// tell which of those sentences stopped working without running the loop and watching it fail.
//
// A brief carries no instructions about how to reason. It carries four things that are true whatever
// model is reading them: what this stage owns, the evidence gathered for it, the contracts bound to
// it, and the commands that will judge its output. Those are derived from disk, so they cannot drift
// from reality, and a new model needs no new prose to use them.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STAGES, resolveRunState, type StageId } from '../stage/contract.ts';
import { detectAppShell, renderTargetHint, type AppShell } from '../stack/shell.ts';
import { readPersistedRoute, type RouteRecord } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';

export {
  EVIDENCE_CLAIM_PUBLICATION_SCHEMA,
  EvidenceClaimError,
  parseEvidenceClaimPublication,
  type ConfirmedEvidenceClaim,
  type EvidenceClaim,
  type EvidenceClaimErrorCode,
  type EvidenceClaimPublication,
  type EvidenceClaimStatus,
  type ExplicitUserEvidence,
  type HypothesisEvidenceClaim,
  type TemporaryDecisionEvidenceClaim,
} from './evidence-claims.ts';

export { formatBrief } from './format.ts';

export {
  TASK_OUTCOME_CONTRACT_SCHEMA,
  TaskOutcomeContractError,
  parseTaskOutcomeContract,
  type TaskOutcomeContract,
  type TaskOutcomeContractErrorCode,
} from './task-outcome.ts';

/** Stages the route can name that are not artifact stages in `STAGES`. */
export const EXTRA_BRIEF_STAGES = ['production', 'independent-review', 'review'] as const;
export type BriefStage = StageId | (typeof EXTRA_BRIEF_STAGES)[number];

/**
 * A brief is evidence, not a reading list. A mature run holds a hundred captures; printing all of
 * them recreates the wall of text this command exists to replace, so the brief carries the ones
 * that actually carry a measured principle and reports the rest as a count.
 */
export const MAX_BRIEF_REFERENCES = 12;

export type BriefReference = {
  readonly path: string;
  readonly component: string;
  readonly slot: string | null;
  /** Measured principles — what this capture is evidence *for*. */
  readonly take: readonly string[];
};

export type BriefCheck = {
  readonly command: string;
  /** What a failure means, in one clause. Never advice on how to avoid it. */
  readonly fails: string;
};

export type Brief = {
  readonly stage: BriefStage;
  readonly owner: string;
  readonly owns: readonly string[];
  readonly route: { readonly name: string; readonly roles: readonly string[]; readonly references: string } | null;
  readonly references: readonly BriefReference[];
  /** Captures gathered but not printed. `omd ref list` shows them all. */
  readonly referencesOmitted: number;
  readonly contracts: readonly { readonly path: string; readonly delivered: boolean }[];
  readonly schemas: readonly { readonly name: string; readonly command: string }[];
  readonly shell: { readonly kind: string; readonly target: string } | null;
  readonly judgedBy: readonly BriefCheck[];
  readonly prior: readonly string[];
  /** Missing inputs this stage cannot start without. */
  readonly blockers: readonly string[];
};

const OWNER: Readonly<Record<string, string>> = {
  production: 'omd-hand', 'independent-review': 'omd-eye', review: 'omd-eye',
};
const OWNS: Readonly<Record<string, readonly string[]>> = {
  production: ['production source (every file the surface ships)'],
  'independent-review': ['the independent review verdict returned to the coordinator'],
  review: ['the independent review verdict returned to the coordinator'],
};

/**
 * Which commands judge a stage. This is the acceptance contract: a stage owner should be able to
 * predict its own verdict, and a rule that is checked here never needs to be written as prose.
 */
const JUDGED_BY: Readonly<Record<string, readonly BriefCheck[]>> = {
  frame: [{ command: 'omd frame show', fails: 'the frame is missing a required field or its evidence' }],
  acquisition: [{ command: 'omd ref granularity --json', fails: 'a declared zone has no capture bound to it' }],
  scout: [
    { command: 'omd ref check', fails: 'the board is one-source, kinship-unresolved, low-signal, or zone-uncovered' },
    { command: 'omd ref audit', fails: 'captures were taken sequentially instead of in one batch' },
  ],
  'reference-board': [{ command: 'omd ref check', fails: 'board evidence or the saved selection is stale' }],
  copy: [
    { command: 'omd copy --check', fails: 'the deck is missing required structure or fact refs' },
    { command: 'omd locale check', fails: 'a declared locale has no Beat copy' },
  ],
  'type-proof': [{ command: 'omd check <specimen>', fails: 'type scale, leading, or contrast violates the committed ladders' }],
  composition: [{ command: 'omd composition --check', fails: 'composition sections are incomplete or their inputs are stale' }],
  production: [
    { command: 'omd check <page>', fails: 'tokens, accessibility, or slop rules are violated' },
    { command: 'omd complete check <page>', fails: 'a declared affordance is absent, inert, or keyboard-unreachable' },
    { command: 'omd route check --activation <host-issued-invocation.json>', fails: 'a file was written outside the route scope' },
    { command: 'omd slop scan <root>', fails: 'source-level slop candidates need triage' },
  ],
  'independent-review': [{ command: 'omd check <page> --json', fails: 'the deterministic findings the verdict must account for' }],
  review: [{ command: 'omd check <page> --json', fails: 'the deterministic findings the verdict must account for' }],
};

/** Hand-authored inputs a stage owner writes, and the command that prints their exact shape. */
const SCHEMAS: Readonly<Record<string, readonly string[]>> = {
  domain: ['domain-brief'],
  depth: ['depth-input'],
  frame: ['functional-requirements'],
  acquisition: ['functional-requirements'],
  'reference-board': ['reference-board'],
  'art-direction': ['art-direction-check'],
  copy: ['locale-contract'],
  production: ['route-input'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readRoute(root: string, invocation?: ProjectRunInvocation): RouteRecord | null {
  const path = join(root, '.omd', 'route.json');
  if (!existsSync(path)) return null;
  if (invocation === undefined) throw new Error('adaptive route authority is required');
  return readPersistedRoute(root, invocation);
}

/**
 * The captures gathered for this run, with the principle each one was kept for.
 *
 * A reference with its measured principle is the instruction. "Make it distinctive" is not.
 */
export function briefReferences(root: string): readonly BriefReference[] {
  const dir = join(root, '.omd', 'refs');
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  const out: BriefReference[] = [];
  for (const name of names.sort()) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (!isRecord(parsed) || typeof parsed.component !== 'string') continue;
      const principles = Array.isArray(parsed.principles)
        ? parsed.principles.filter((entry): entry is string => typeof entry === 'string')
        : [];
      out.push({
        path: `.omd/refs/${name}`,
        component: parsed.component,
        slot: typeof parsed.slot === 'string' ? parsed.slot : null,
        take: principles,
      });
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (error instanceof SyntaxError || code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') {
        continue; // The reference gate reports malformed or concurrently removed records.
      }
      throw error;
    }
  }
  return out;
}

/** Renders and probes an earlier round already produced, so a revision compares instead of guessing. */
function priorEvidence(root: string): readonly string[] {
  const dir = join(root, '.omd', '.cache');
  try {
    return readdirSync(dir)
      .filter((name) =>
        /\.(png|json)$/.test(name)
        && /(render|desktop|mobile|shot|probe|filmstrip|review|squint|sharp|ir)/i.test(name))
      .sort()
      .slice(0, 8)
      .map((name) => `.omd/.cache/${name}`);
  } catch {
    return [];
  }
}

export function buildBrief(
  root: string,
  stage: BriefStage,
  packRoot = join(root, 'core'),
  invocation?: ProjectRunInvocation,
): Brief {
  const definition = STAGES.find((entry) => entry.id === stage);
  if (definition === undefined && !(EXTRA_BRIEF_STAGES as readonly string[]).includes(stage)) {
    throw new Error(`unknown stage ${stage}; known: ${[...STAGES.map((s) => s.id), ...EXTRA_BRIEF_STAGES].join(', ')}`);
  }

  const route = readRoute(root, invocation);
  const shell: AppShell = detectAppShell(root);
  const routeReferenceLimit = MAX_BRIEF_REFERENCES;
  const gathered = briefReferences(root);
  // A capture that recorded a measured principle is usable evidence; one that did not is a file path.
  const ranked = [...gathered].sort((left, right) => right.take.length - left.take.length);
  const references = ranked.slice(0, routeReferenceLimit);
  const contracts = definition === undefined
    ? []
    : (() => {
      const state = resolveRunState(root, packRoot, invocation);
      const stageState = state.stages.find((entry) => entry.stage === definition.id);
      return definition.requiredContracts.map((path) => ({
        path,
        delivered: stageState?.delivered.includes(path) ?? false,
      }));
    })();

  const blockers: string[] = [];
  if (route === null) blockers.push('no route: run `omd route classify --input <route-input.json> --activation <host-issued-invocation.json>`');
  if (definition !== undefined) {
    for (const contract of contracts) {
      if (!contract.delivered) blockers.push(`contract not delivered: omd stage deliver --stage ${definition.id} --contract ${contract.path}`);
    }
  }
  if (stage === 'production' && route?.references.decision === 'discover' && references.length === 0) {
    blockers.push('selected reference discovery has no gathered evidence');
  }

  return {
    stage,
    owner: definition?.owner ?? OWNER[stage] ?? 'coordinator',
    owns: definition === undefined ? OWNS[stage] ?? [] : [definition.artifact],
    route: route === null ? null : {
      name: route.route,
      roles: route.strategy.roles,
      references: route.references.decision === 'discover'
        ? `discover — ${route.references.intended}`
        : `skip — ${route.references.actual.description}`,
    },
    references,
    referencesOmitted: gathered.length - references.length,
    contracts,
    schemas: (SCHEMAS[stage] ?? []).map((name) => ({ name, command: `omd schema ${name}` })),
    shell: shell.kind === 'browser' ? null : { kind: shell.kind, target: renderTargetHint(shell) },
    judgedBy: JUDGED_BY[stage] ?? [],
    prior: priorEvidence(root),
    blockers,
  };
}
