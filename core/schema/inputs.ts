// Canonical skeletons for the inputs a coordinator authors by hand.
//
// Every one of these files is written into `.omd/` (or `.omd/.cache/`) by a chat agent, then
// validated by a CLI gate. Without a printable skeleton the agent reads `core/**` to recover the
// key list, which costs a stage retry when it guesses wrong. `omd schema <name>` prints these.

import { DEPTH_INPUT_KEYS, DEPTH_INPUT_SCHEMA, DEPTH_SCOPES } from '../deliberation/depth.ts';
import { ART_DIRECTION_CHECK_INPUT_KEYS } from '../art-direction/schema.ts';
import { LOCALE_CONTRACT_KEYS, LOCALE_CONTRACT_SCHEMA, LOCALE_MODES } from '../locale/contract.ts';
import { FUNCTIONAL_REQUIREMENTS_SCHEMA, REQUIREMENT_KINDS } from '../completeness/index.ts';
import { DOMAIN_BRIEF_SCHEMA } from '../domain/domain-brief.ts';
import { DECISION_GRAPH_SCHEMA } from '../deliberation/contracts.ts';

export type InputSkeleton = {
  readonly name: string;
  /** Where the authored file belongs, so the printed skeleton is directly usable. */
  readonly path: string;
  readonly command: string;
  readonly keys: readonly string[];
  readonly skeleton: unknown;
};

const DEPTH_INPUT: InputSkeleton = {
  name: 'depth-input',
  path: '.omd/depth.json',
  command: 'omd depth classify --input .omd/depth.json --json',
  keys: DEPTH_INPUT_KEYS,
  skeleton: {
    schema: DEPTH_INPUT_SCHEMA,
    scope: DEPTH_SCOPES[2],
    zoneCount: 1,
    newPrimaryCta: false,
    newInformationArchitecture: false,
    multiScreenState: false,
    costlyError: false,
    brandDirectionChange: false,
    showpieceMotion: false,
    webgl: false,
    referenceZones: 0,
  },
};

const ART_DIRECTION_ALTERNATIVE = {
  register: '<quiet|confident|showpiece>',
  subjectIdentityFit: '<why this register fits the subject, from permitted evidence>',
  staticReferenceSlotIds: ['<slotId from the settled selection>'],
  motionReferenceSlotIds: [],
  conceptRole: '<the concept this direction carries>',
  macroCompositionHypothesis: '<macro system; motion none requires a named template departure>',
  motionHypothesis: '<none|one>',
  uxAccessibilityPerformanceRisks: '<risks this direction accepts>',
  lawfulImplementationPath: '<how it ships lawfully in the chosen stack>',
  rejectionCondition: '<observable condition that would reject this direction>',
};

const ART_DIRECTION_CHECK: InputSkeleton = {
  name: 'art-direction-check',
  path: '.omd/.cache/art-direction-check.json',
  command: 'omd art-direction local-check --input .omd/.cache/art-direction-check.json --json',
  keys: ART_DIRECTION_CHECK_INPUT_KEYS,
  skeleton: {
    route: '/',
    alternatives: [ART_DIRECTION_ALTERNATIVE],
    references: '<run `omd art-direction check-input` to emit the canonical references array>',
    eligibility: { sceneRoles: [], fallbackAttempted: true },
    evaluatorAssessment: {
      assessments: [{
        register: '<quiet|confident|showpiece>',
        score: 0,
        subjectIdentityRationale: '<evaluator rationale>',
        conceptRoleRationale: '<evaluator rationale>',
        uxAccessibilityPerformanceRationale: '<evaluator rationale>',
        lawfulFeasibilityRationale: '<evaluator rationale>',
        referenceEvidenceRationale: '<evaluator rationale>',
        rejectionRationale: '<evaluator rationale>',
      }],
    },
    evaluatorResult: {
      winner: '<highest-scoring register>',
      alternativesSha256: '<omd art-direction alternatives-sha --input <alternatives.json> --json>',
      motionResolution: { motionDecision: '<none|one>', slots: [] },
    },
    beats: ['B-1'],
    deliberation: '.omd/deliberations/<moderator-receipt-id>.json',
    implementationLane: '<how the selected direction is built>',
    fallbackPath: '<lawful css/svg/static or reduced-motion fallback that was tried>',
    performanceAccessibilityBudget: '<budget the build must hold>',
  },
};

const LOCALE_CONTRACT: InputSkeleton = {
  name: 'locale-contract',
  path: '.omd/locale.json',
  command: 'omd locale check --json',
  keys: LOCALE_CONTRACT_KEYS,
  skeleton: {
    schema: LOCALE_CONTRACT_SCHEMA,
    mode: LOCALE_MODES[0],
    locales: ['ko-KR', 'en-US'],
    primary: 'ko-KR',
  },
};

const FUNCTIONAL_REQUIREMENTS: InputSkeleton = {
  name: 'functional-requirements',
  path: '.omd/functional-requirements.json',
  command: 'omd complete check <page> --json',
  keys: ['schema', 'requirements'],
  skeleton: {
    schema: FUNCTIONAL_REQUIREMENTS_SCHEMA,
    requirements: [{
      id: 'R-1',
      kind: REQUIREMENT_KINDS[0],
      statement: "<what the visitor must be able to do, in the brief's words>",
      label: '<the visible text that proves the affordance exists>',
    }],
  },
};

const DOMAIN_BRIEF: InputSkeleton = {
  name: 'domain-brief',
  path: '.omd/domain-brief.json',
  command: 'omd domain check --input .omd/domain-brief.json --json',
  keys: ['schema', 'request', 'domain', 'summary', 'surfaces', 'coreObjects', 'audience', 'referenceQueries', 'researched'],
  skeleton: {
    schema: DOMAIN_BRIEF_SCHEMA,
    request: '<the raw request, normalized>',
    domain: '<the domain in a few words>',
    summary: '<one line: what this domain is and does>',
    surfaces: [{ name: '<canonical page or screen>', purpose: '<the task it serves, one clause>' }],
    coreObjects: ['<the real nouns the domain manipulates>'],
    audience: '<who the work is for>',
    referenceQueries: {
      component: ['<detailed component or section design query>'],
      craft: ['<motion, scroll, or sculptural craft query>'],
    },
    researched: false,
  },
};

const DECISION_GRAPH: InputSkeleton = {
  name: 'decision-graph',
  path: '.omd/decision-graph.json',
  command: 'omd deliberate check --json',
  keys: ['schema', 'decisions'],
  skeleton: {
    schema: DECISION_GRAPH_SCHEMA,
    decisions: [{
      id: '<kebab-case-decision-id>',
      stage: '<frame|copy|type|composition|structure|production|refinement>',
      risk: '<low|medium|high|critical>',
      owner: '<the role that owns that stage, never the coordinator>',
      question: '<the consequential question this decision answered>',
      alternatives: [
        { id: '<kebab-id>', label: '<what this alternative was>' },
        { id: '<kebab-id>', label: '<the other real option>' },
      ],
      selected: '<the chosen alternative id>',
      evidence: ['<path or record that supports the choice>'],
      constraints: ['<what the choice had to hold>'],
      rejected: [{ id: '<kebab-id>', reason: '<why it lost, from evidence>' }],
      affects: ['<downstream artifact or decision>'],
      dependsOn: ['<upstream decision id>'],
      reversible: true,
      tradeoffs: [{
        goal: '<what was wanted>',
        constraint: '<what stopped it>',
        attempt: '<what was actually tried>',
        failureEvidence: ['<observed failure>'],
        compromise: '<what shipped instead>',
        resultEvidence: ['<observed result>'],
      }],
    }],
  },
};

export const INPUT_SKELETONS: readonly InputSkeleton[] = [DOMAIN_BRIEF, DEPTH_INPUT, ART_DIRECTION_CHECK, LOCALE_CONTRACT, FUNCTIONAL_REQUIREMENTS, DECISION_GRAPH];

export function inputSkeleton(name: string): InputSkeleton {
  const found = INPUT_SKELETONS.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`unknown schema ${name}; known: ${INPUT_SKELETONS.map((entry) => entry.name).join(', ')}`);
  }
  return found;
}
