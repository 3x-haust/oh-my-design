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
import {
  BOARD_TAKE_VALUES,
  REFERENCE_AXIS_VALUES,
  REFERENCE_RIGHTS_VALUES,
  REFERENCE_SIGNAL_VALUES,
} from '../ref/board-contract.ts';
import { ROUTE_INPUT_KEYS, ROUTE_INPUT_SCHEMA } from '../route/index.ts';

export type InputSkeleton = {
  readonly name: string;
  /** Where the authored file belongs, so the printed skeleton is directly usable. */
  readonly path: string;
  readonly command: string;
  readonly keys: readonly string[];
  /** Validator constraints that JSON alone cannot express. */
  readonly constraints?: readonly string[];
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
  metaphorQualities: ['<perceptual quality to preserve without literalizing the metaphor>'],
  literalPropsToReject: ['<literal prop or close visual stand-in to exclude>'],
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

const REFERENCE_BOARD_PIECE = {
  slotId: '<required acquisition-zone id>',
  source: '<exact captured reference source>',
  component: '<exact captured component name>',
  targetComponent: '<local component or section>',
  targetSelector: '<local selector such as [data-zone="hero"]>',
  taskIds: ['<T# or zone task id>'],
  reason: '<why this brick answers the zone job>',
  take: [BOARD_TAKE_VALUES[0]],
  avoid: '<source identity or content that must not transfer>',
  adaptation: '<how the measured principle changes for this project>',
  grid: {
    column: 1,
    span: 12,
    order: 0,
  },
  rights: REFERENCE_RIGHTS_VALUES[0],
  signal: REFERENCE_SIGNAL_VALUES[0],
  motionAxis: REFERENCE_AXIS_VALUES[1],
};

const ROUTE_INPUT: InputSkeleton = {
  name: 'route-input',
  path: '.omd/.cache/route-input.json',
  command: 'omd route classify --input .omd/.cache/route-input.json --json --activation <host-issued-invocation.json>',
  keys: ROUTE_INPUT_KEYS,
  constraints: [
    'task outcome, policy, claims, discovery, design axes, capability, browser, and learning contexts are all required',
    'the user-selected model owns role, stage, and method order',
    'every omitted optional stage or method carries a non-empty skip reason',
    'production, decision-linked browser evidence, independent review, hard safety rails, required outcomes, activation, project-write, source seal, and final-v2 evidence cannot be skipped',
    'allowedPaths lists the globs the production hand may write; authority-bound `omd route check` reports writes outside them',
  ],
  skeleton: {
    schema: ROUTE_INPUT_SCHEMA,
    request: '<the user request, verbatim>',
    namedDependencies: [],
    allowedPaths: ['src/**'],
    taskOutcome: {
      schema: 'task-outcome-contract-v1', goal: '<required result>', mustHave: ['<required outcome>'],
      mustNotHave: ['<prohibited outcome>'], completionEvidence: ['<observable evidence>'], strategyFreedom: ['<model-owned strategy freedom>'],
    },
    uxPolicy: { schema: 'ux-policy-v1', decisions: [{ id: 'task-complete', kind: 'required_outcome', status: 'required' }] },
    evidenceClaims: {
      schema: 'evidence-claim-publication-v1',
      claims: [{ id: 'user-request', text: '<confirmed user fact>', status: 'confirmed', userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'message-1', excerpt: '<user excerpt>' }] }],
      userFacts: ['user-request'], workingContext: [],
    },
    referenceDiscovery: {
      schema: 'reference-discovery-input-v1', taskNeed: 'copy-only-edit', uncertainty: 'resolved', existingEvidence: 'sufficient',
      intendedUse: '<how evidence informs the task>', existingEvidenceUse: '<existing evidence actually used>', skipReason: '<why discovery is unnecessary>',
    },
    designAxes: { schema: 'design-axis-input-v1', taskSize: 'small', failureRisk: 'low', uxNeed: 'baseline', expressiveDesignNeed: 'restrained' },
    modelCapability: {
      now: 0,
      routingInput: { schema: 'model-capability-probe-routing-input-v1', selectedModel: { selection: 'host-selection', provider: 'host-provider', modelId: 'host-model', revision: 'current' }, profile: null },
    },
    browserDecisionContext: { schema: 'adaptive-browser-decision-context-v1', status: 'pending', decisionIds: [], reason: '<fresh linked observation is pending>' },
    validatedLearningContext: { schema: 'adaptive-learning-context-v1', status: 'none', learningIds: [], reason: '<no validated scoped learning applies>' },
    strategyDecision: {
      schema: 'adaptive-strategy-decision-v1', owner: 'user-selected-model', roles: ['omd-writer', 'omd-hand', 'omd-eye'],
      stages: ['copy', 'production', 'browser-evidence', 'independent-review'],
      executionWaves: [
        { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
        { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
        { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
      ],
      methods: [
        'design-strategy-balanced-delivery', 'model-capability-probe', 'evidence-claim-accounting',
        'decision-linked-browser-observation', 'copy-repair-workflow',
      ],
      aiAssets: [],
      attributionCategories: ['tokens'],
      skips: [
        { id: 'reference-discovery', reason: '<existing evidence is sufficient>' },
        { id: 'domain', reason: '<domain is established>' }, { id: 'depth', reason: '<no deep deliberation needed>' },
        { id: 'frame', reason: '<no framing change>' }, { id: 'acquisition', reason: '<no acquisition needed>' },
        { id: 'scout', reason: '<discovery skipped>' }, { id: 'reference-board', reason: '<no board needed>' },
        { id: 'reference-selection', reason: '<no selection needed>' }, { id: 'art-direction', reason: '<direction unchanged>' },
        { id: 'type-proof', reason: '<typography unchanged>' }, { id: 'composition', reason: '<composition unchanged>' },
        { id: 'candidate-generation', reason: '<no structural alternatives needed>' },
        { id: 'safety-validation', reason: '<no high-risk safety outcome>' },
        { id: 'reflection-in-action', reason: '<no extra craft cycle needed>' },
        { id: 'reference-distance', reason: '<no reference work selected>' },
        { id: 'image-first-draft', reason: '<no generated design draft selected>' },
        { id: 'evidence-driven-refinement', reason: '<one verified pass is sufficient>' },
        { id: 'motion-one', reason: '<no motion scene selected>' },
        { id: 'ai-shipped-asset', reason: '<no generated asset ships>' },
      ],
      rationale: '<why this strategy reaches the outcomes safely>',
    },
  },
};

const REFERENCE_BOARD: InputSkeleton = {
  name: 'reference-board',
  path: '.omd/.cache/candidate-assemblies.json',
  command: 'omd ref board --input .omd/.cache/candidate-assemblies.json --json',
  keys: ['candidates'],
  constraints: [
    'candidates contains at least two independently assembled alternatives',
    'every candidate contains id, label, route, rationale, pieces and covers every required acquisition zone',
    'every piece grid contains exactly column, span, order',
    'grid.column is 1..12; grid.span is 1..12 and column + span <= 13; grid.order is a unique non-negative integer per candidate',
    `take uses only ${BOARD_TAKE_VALUES.join('|')}`,
    `rights uses ${REFERENCE_RIGHTS_VALUES.join('|')}; signal uses ${REFERENCE_SIGNAL_VALUES.join('|')}; motionAxis uses ${REFERENCE_AXIS_VALUES.join('|')}`,
    'supporting-content requires a persisted exact `content-only:` principle and take content|voice; anti-reference requires `anti-reference:` and take rejection',
    'geometry, visual style, motion, and interaction claims remain component/image capture evidence and require current pixels',
  ],
  skeleton: {
    candidates: [
      {
        id: '<kebab-case-candidate-a>',
        label: '<candidate A label>',
        route: '/',
        rationale: '<macro assembly rationale>',
        pieces: [REFERENCE_BOARD_PIECE],
      },
      {
        id: '<kebab-case-candidate-b>',
        label: '<candidate B label>',
        route: '/',
        rationale: '<independently assembled alternative>',
        pieces: [{ ...REFERENCE_BOARD_PIECE, grid: { column: 1, span: 12, order: 0 } }],
      },
    ],
  },
};

export const INPUT_SKELETONS: readonly InputSkeleton[] = [ROUTE_INPUT, DOMAIN_BRIEF, DEPTH_INPUT, REFERENCE_BOARD, ART_DIRECTION_CHECK, LOCALE_CONTRACT, FUNCTIONAL_REQUIREMENTS, DECISION_GRAPH];

export function inputSkeleton(name: string): InputSkeleton {
  const found = INPUT_SKELETONS.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`unknown schema ${name}; known: ${INPUT_SKELETONS.map((entry) => entry.name).join(', ')}`);
  }
  return found;
}
