// Canonical skeletons for the inputs a coordinator authors by hand.
//
// Every one of these files is written into `.omd/` (or `.omd/.cache/`) by a chat agent, then
// validated by a CLI gate. Without a printable skeleton the agent reads `core/**` to recover the
// key list, which costs a stage retry when it guesses wrong. `omd schema <name>` prints these.

import { DEPTH_INPUT_KEYS, DEPTH_INPUT_SCHEMA, DEPTH_SCOPES } from '../deliberation/depth.ts';
import { CAPTURE_PREPARATION_SCHEMA } from '../ref/capture-preparation.ts';
import { ART_DIRECTION_CHECK_INPUT_KEYS } from '../art-direction/schema.ts';
import { LOCALE_CONTRACT_KEYS, LOCALE_CONTRACT_SCHEMA, LOCALE_MODES } from '../locale/contract.ts';
import {
  LOCALE_DESIGN_CONTEXT_KEYS,
  LOCALE_DESIGN_CONTEXT_SCHEMA,
  LOCALE_DESIGN_FITS,
  LOCALE_DESIGN_SURFACES,
} from '../locale/design-context.ts';
import {
  CULTURAL_DESIGN_AXES,
  CULTURAL_DESIGN_PROFILE_KEYS,
  CULTURAL_DESIGN_PROFILE_SCHEMA,
} from '../locale/cultural-profile.ts';
import { FUNCTIONAL_REQUIREMENTS_SCHEMA, REQUIREMENT_KINDS } from '../completeness/index.ts';
import { DOMAIN_BRIEF_SCHEMA } from '../domain/domain-brief.ts';
import { ACQUISITION_PLAN_V2_SCHEMA, DECISION_GRAPH_SCHEMA, REFERENCE_INFLUENCE_AXIS_VALUES } from '../deliberation/contracts.ts';
import {
  BOARD_TAKE_VALUES,
  REFERENCE_AXIS_VALUES,
  REFERENCE_RIGHTS_VALUES,
  REFERENCE_SIGNAL_VALUES,
} from '../ref/board-contract.ts';
import { ROUTE_INPUT_KEYS, ROUTE_INPUT_SCHEMA } from '../route/index.ts';
import {
  TASK_FLOW_BENCHMARK_KEYS,
  TASK_FLOW_BENCHMARK_SCHEMA,
} from '../ref/task-flow-benchmark.ts';
import { ENTRY_SURFACE_CONTRACT_SCHEMA } from '../frame/entry-surface-contract.ts';
import {
  REALITY_CATEGORY_VALUES,
  REALITY_STATUS_VALUES,
} from '../types.ts';

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
  uxAccessibilityPerformanceRisks: ['<risk this direction accepts>'],
  lawfulImplementationPath: '<how it ships lawfully in the chosen stack>',
  rejectionCondition: '<observable condition that would reject this direction>',
};

const ART_DIRECTION_EVALUATOR_LINEAGE = {
  route: '<current selected candidate route>',
  taskIds: ['<sorted unique task ID from current selected candidate pieces; [] if none>'],
  boardSha256: '<current pre-reference selection captureSha256>',
  preSelectionSha256: '<current pre-reference selection semantic SHA-256>',
  handoffSha256: '<current art-direction handoff payloadSha256>',
  intentSha256: '<current intent-ledger SHA-256>',
  alternativesSha256: '<canonical digest from omd art-direction alternatives-sha --input <alternatives.json> --json>',
};

const ART_DIRECTION_CHECK: InputSkeleton = {
  name: 'art-direction-check',
  path: '.omd/.cache/art-direction-check.json',
  command: 'omd art-direction check --input .omd/.cache/art-direction-check.json --json',
  keys: ART_DIRECTION_CHECK_INPUT_KEYS,
  constraints: [
    'evaluatorAssessment and evaluatorResult are complete evaluator-owned evidence, not coordinator-authored scores; give the fresh evaluator the current source-free inputs and exact lineage before it judges',
    'both evaluator objects bind the same current route, sorted unique taskIds (which may be []), board, pre-selection, handoff, intent, and canonical alternatives digest; do not use a raw file digest for alternativesSha256',
    'evaluatorAssessment.alternatives preserves the complete assessed alternatives array, and assessments has exactly one assessment per unique alternative register; ranking uses the highest numeric score, with ascending register-name tie-break; evaluatorResult.winner must match that ranking',
    'supply two or three distinct supported registers, or a singleton matching the current explicit user register lock; a motion-only lock and visible-evidence-only rationale do not authorize a canonical singleton',
    'upstream concept studies may share a register; compare their visible results before choosing a representative for the canonical register table, and do not invent a third concept to fill it; remaining expression-strength uncertainty may compare realizations of the same selected concept while preserving its invariants, not claim new conceptual diversity',
    'motionResolution.slots settles every pending motion slot from the current pre-selection; none rejects all pending slots with specific evidenced reasons; slots:[] is valid only when no pending slots exist',
    'for an approved motion recipe, evaluatorResult additionally carries both approvedMotionRecipe and approvedMotionRecipeReceipt, bound to the exact authorized recipe bytes; omit both when no recipe is approved',
    'preserve the exact receipt-bound evaluatorAssessment and evaluatorResult payload serialization through the authorized publication path; missing input is a transport repair, not permission to reconstruct unseen judgments or relax lineage checks',
  ],
  skeleton: {
    route: '/',
    alternatives: [ART_DIRECTION_ALTERNATIVE],
    references: '<run `omd art-direction check-input` to emit the canonical references array>',
    eligibility: { sceneRoles: [], fallbackAttempted: true },
    evaluatorAssessment: {
      ...ART_DIRECTION_EVALUATOR_LINEAGE,
      alternatives: [ART_DIRECTION_ALTERNATIVE],
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
      ...ART_DIRECTION_EVALUATOR_LINEAGE,
      winner: '<highest-scoring register>',
      motionResolution: { motionDecision: '<none|one>', slots: [{ slotId: '<each pending slot from current pre-selection; omit this entry only when no pending slots exist>', obligationDisposition: '<used|rejected; none requires rejected>', obligationReason: '<specific evaluator-owned evidence for this disposition>' }] },
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

const LOCALE_DESIGN_CONTEXT: InputSkeleton = {
  name: 'locale-design-context',
  path: '.omd/locale-design-context.json',
  command: 'omd locale plan --json',
  keys: LOCALE_DESIGN_CONTEXT_KEYS,
  constraints: [
    'conversationLanguage is a BCP 47 tag or null and never selects the shipped surface language',
    'surfaceLocale is a BCP 47 tag; likely-subtag inference may supply script mechanics but never marketRegion',
    'market-grounded fit requires explicit marketRegion and audience or returns exactly one question',
    'locale-mechanics-only withholds every market-aesthetic claim',
    'brandInvariants contains unique visible strings and may be explicitly empty',
  ],
  skeleton: {
    schema: LOCALE_DESIGN_CONTEXT_SCHEMA,
    conversationLanguage: 'ko-KR',
    surfaceLocale: 'ja-JP',
    marketRegion: null,
    audience: null,
    domain: '<product or content domain>',
    surface: LOCALE_DESIGN_SURFACES[0],
    desiredFit: LOCALE_DESIGN_FITS[0],
    brandInvariants: ['<fact, outcome, accessibility, or identity that must not change>'],
  },
};

const CULTURAL_DESIGN_PROFILE: InputSkeleton = {
  name: 'cultural-design-profile',
  path: '.omd/.cache/cultural-design-profile.json',
  command: 'omd locale profile --input .omd/.cache/cultural-design-profile.json --locale-context .omd/locale-design-context.json --json',
  keys: CULTURAL_DESIGN_PROFILE_KEYS,
  constraints: [
    'contextSha256 must equal the exact current research route context; the zero digest cannot authorize a real context',
    'sources are current standard, global-equivalent, native-category, or counterexample receipts; unavailable sources have null URL/timestamp/hash',
    'supported/shared axes require native, global-or-unavailable, and captured counterexample evidence',
    'contested/unknown axes transfer no mechanism or adaptation',
    'the derived composer projection contains no source URL, identity, selector, path, markup, or image reference',
  ],
  skeleton: {
    schema: CULTURAL_DESIGN_PROFILE_SCHEMA,
    contextSha256: '0'.repeat(64),
    capturedAt: '1970-01-01T00:00:00.000Z',
    sources: [],
    brandInvariants: [],
    authorizedMarketFacts: [],
    typeProofSha256: '0'.repeat(64),
    decisions: CULTURAL_DESIGN_AXES.map((axis) => ({
      id: axis, axis, status: 'unknown', sourceIds: [], counterexampleIds: [],
      mechanism: null, adaptation: null,
      avoid: '<unsupported inference this axis must avoid>',
      falsifier: '<visible condition that would reject the decision>',
    })),
    rejectedCliches: [],
    confidence: 'contested',
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
  slotId: '<unique influence id>',
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
  binding: {
    zoneId: '<required acquisition-zone id>',
    decisionId: '<decision id declared by that zone>',
    axis: REFERENCE_INFLUENCE_AXIS_VALUES[0],
    sourceState: '<observed reference state matching the planned zone.requiredState>',
    sourceViewport: { width: 1280, height: 900 },
    targetViewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
    responsiveConsequence: '<what must change or remain at the paired viewport>',
    conflictGroup: null,
    conflictResolution: null,
    falsifier: '<observable failure copied from the acquisition zone>',
  },
};

const ACQUISITION_PLAN: InputSkeleton = {
  name: 'acquisition-plan',
  path: '.omd/acquisition-plan.json',
  command: 'omd acquisition set --input .omd/.cache/acquisition-plan.json',
  keys: ['schema', 'owner', 'localeContextSha256', 'zones'],
  constraints: [
    'localeContextSha256 is the current locale-design-context file hash, or null only when no market claim is made',
    `each zone axes uses unique values from ${REFERENCE_INFLUENCE_AXIS_VALUES.join('|')}`,
    'each zone names the decision question, exact state, required viewports, and observable falsifier before research',
    'requiredState names a reference component state to inspect, not a desired destination capability or destination-specific copy',
    'keep destination outcomes in the job, question, falsifier and functional requirements; a reference example need not operate the destination product',
    'if a current requiredState describes the destination instead of an inspectable source state, Framer repairs the acquisition plan before Scout rebuilds the board; never relabel an observation to satisfy a string comparison',
    'zone and decision ids are unique lowercase kebab slugs; at least one zone is required',
  ],
  skeleton: {
    schema: ACQUISITION_PLAN_V2_SCHEMA,
    owner: 'omd-framer',
    localeContextSha256: null,
    zones: [{
      id: '<destination-zone-id>',
      kind: 'section',
      job: '<job this zone performs>',
      required: true,
      decisionId: '<decision-question-id>',
      question: '<what exact design decision must the reference answer?>',
      axes: [REFERENCE_INFLUENCE_AXIS_VALUES[0]],
      requiredState: '<reference component state to inspect, such as visible success notification>',
      viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
      falsifier: '<observable condition showing the transferred decision did not land>',
    }],
  },
};

const REALITY_LEDGER: InputSkeleton = {
  name: 'reality-ledger',
  path: '.omd/.cache/reality-ledger.json',
  command: 'omd frame set ... --reality .omd/.cache/reality-ledger.json',
  keys: ['schema', 'mode', 'facts'],
  constraints: [
    'facts contains 1..12 bounded entries',
    `category is one of: ${REALITY_CATEGORY_VALUES.join(', ')}`,
    `status is one of: ${REALITY_STATUS_VALUES.join(', ')}`,
    'unknown facts remain absent from shipped UI',
    'demo facts stay visibly labelled as demo',
  ],
  skeleton: {
    schema: 'reality-ledger-v1',
    mode: 'greenfield',
    facts: [{
      category: 'subject',
      status: 'supplied',
      statement: '<fact supplied by the user>',
    }],
  },
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
    projectMode: '<greenfield|existing from omd stack>',
    namedDependencies: [],
    allowedPaths: ['src/**'],
    taskOutcome: {
      schema: 'task-outcome-contract-v1', goal: '<required result>', mustHave: ['<required outcome>'],
      mustNotHave: ['<prohibited outcome>'], completionEvidence: ['<observable evidence>'], strategyFreedom: ['<model-owned strategy freedom>'],
    },
    uxPolicy: { schema: 'ux-policy-v1', decisions: [{ id: 'task-complete', kind: 'required_outcome', status: 'required' }] },
    evidenceClaims: {
      schema: 'evidence-claim-publication-v1',
      claims: [
        { id: 'user-request', text: '<confirmed user fact>', status: 'confirmed', userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'message-1', excerpt: '<user excerpt>' }] },
        { id: 'working-assumption', text: '<unverified working context>', status: 'hypothesis', basis: '<why this assumption is needed>' },
      ],
      userFacts: ['user-request'], workingContext: ['working-assumption'],
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
        { id: 'image-first-draft', reason: '<direction already settled, method does not resolve current uncertainty, or host capability unavailable; a draft never ships, so asset-shipping restrictions alone are not a skip reason>' },
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
    'with acquisition-plan-v2 every piece has a unique influence slotId and a closed binding to zoneId, decisionId, primary axis, state, viewport, responsive consequence, optional reconciled conflict, and falsifier',
    'binding.sourceState must truthfully describe the captured reference state and match zone.requiredState; if the plan instead demands a destination-only state, return to Framer for plan repair rather than mislabel the source',
    'several influences may bind one zone; duplicate source-part-axis claims and unresolved same-axis conflicts are rejected',
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

const REFERENCE_LOCALE_BINDING: InputSkeleton = {
  name: 'reference-locale-binding',
  path: '.omd/.cache/reference-locale-bindings.json',
  command: 'omd ref locale-bind --input .omd/.cache/reference-locale-bindings.json --json',
  keys: ['bindings'],
  constraints: [
    'use only when acquisition-plan-v2 binds a current market-grounded locale context',
    'every row binds one exact candidate slot to one current supported/shared cultural decision',
    'positive rows resolve only to captured native-category or same-task global-equivalent sources used by that decision',
    'anti-reference rows resolve only to captured counterexample sources used by that decision',
    'every candidate contains at least one positive native-category binding; matching profile sources cannot be used silently',
  ],
  skeleton: {
    bindings: [{
      candidateId: '<reference-board candidate id>',
      slotId: '<exact slot id in that candidate>',
      localeDecisionId: '<supported/shared decision id from the current cultural profile>',
    }],
  },
};

const TASK_FLOW_BENCHMARK: InputSkeleton = {
  name: 'task-flow-benchmark',
  path: '.omd/.cache/task-flow-benchmark.json',
  command: 'omd benchmark set --input .omd/.cache/task-flow-benchmark.json',
  keys: TASK_FLOW_BENCHMARK_KEYS,
  constraints: [
    'copy the exact root and nested key sets; do not rename, duplicate, nest, or extend fields',
    'sources contains 2..6 independent real-service flows or applicable authoritative guidance',
    'observedPatterns records bounded task-flow observations, never component styling or destination product facts',
    'every task step and counterexample cites current source ids',
    'forbiddenTransfers names source brands, copy, policies, prices, availability, guarantees, and operational claims that cannot become destination facts',
  ],
  skeleton: {
    schema: TASK_FLOW_BENCHMARK_SCHEMA,
    surface: 'product',
    domain: 'residential-field-service',
    sourceContractSha256: '0'.repeat(64),
    sources: [
      {
        id: 'service-a',
        url: 'https://example.com/repair-booking-a',
        observedAt: '2026-08-25',
        observedPatterns: ['observable issue capture precedes scheduling'],
        forbiddenTransfers: ['brand, pricing, availability, and service promises'],
      },
      {
        id: 'service-b',
        url: 'https://example.org/repair-booking-b',
        observedAt: '2026-08-25',
        observedPatterns: ['review and commitment remain distinct'],
        forbiddenTransfers: ['brand, copy, policies, and operational claims'],
      },
    ],
    taskSteps: [
      {
        id: 'capture-symptoms',
        intent: 'capture observable symptoms without requiring diagnosis',
        dependsOn: [],
        evidenceSourceIds: ['service-a', 'service-b'],
      },
      {
        id: 'request-availability',
        intent: 'collect preferred availability after minimum issue scope',
        dependsOn: ['capture-symptoms'],
        evidenceSourceIds: ['service-a'],
      },
    ],
    counterexamples: [
      {
        id: 'schedule-first',
        reason: 'asks for availability before minimum issue scope',
        evidenceSourceIds: ['service-a'],
      },
      {
        id: 'false-completion',
        reason: 'labels a submitted request as confirmed service completion',
        evidenceSourceIds: ['service-b'],
      },
    ],
  },
};

const CONTENT_GRAIN: InputSkeleton = {
  name: 'content-grain',
  path: '.omd/content-grain.json',
  command: 'omd grain check --json',
  keys: ['schema', 'status', 'sources', 'traits', 'fixtures'],
  constraints: [
    'sources are authorized project-relative regular files bound by current sha256',
    'active Grain contains 1..3 traits, exactly one typical fixture, at least one edge fixture, and at most one protected outlier',
    'the artifact stores paths, hashes, measurements, consequences, and falsifiers; never raw source payloads',
  ],
  skeleton: {
    schema: 'content-grain-v1',
    status: 'active',
    sources: [{
      id: 'catalog',
      authority: 'project-first-party',
      path: 'content/catalog.json',
      sha256: '0'.repeat(64),
    }],
    traits: [{
      id: 'description-length',
      sourceIds: ['catalog'],
      fixtureIds: ['typical-description', 'long-description'],
      metric: {
        kind: 'range',
        unit: 'graphemes',
        minimum: 12,
        typical: 48,
        maximum: 164,
      },
      semanticRole: 'primary-proof',
      antiTemplateConsequence: '<visible structure that must not flatten this content>',
      responsiveConsequence: '<how the content hierarchy recomposes on mobile>',
      falsifier: '<observable browser condition that rejects the consequence>',
    }],
    fixtures: [
      {
        id: 'typical-description',
        sourceId: 'catalog',
        locator: '$.services[1].description',
        role: 'typical',
      },
      {
        id: 'long-description',
        sourceId: 'catalog',
        locator: '$.services[2].description',
        role: 'maximum',
      },
    ],
  },
};

const TRUSTED_LIFECYCLE_MANIFEST: InputSkeleton = {
  name: 'trusted-lifecycle-manifest',
  path: '.omd/.cache/trusted-lifecycle-manifest.json',
  command: 'omd lifecycle plan --project . --output .omd/.cache/trusted-lifecycle-manifest.json --activation <host-issued-invocation.json>',
  keys: ['schema', 'entryPath', 'scripts', 'entrySurface'],
  constraints: [
    '`entrySurface` is required only when the active route includes `greenfield-task-flow-benchmark`.',
    '`benchmarkProjectionSha256` is the SHA-256 of the current projection file bytes.',
    '`dependentTaskId.dependsOn` must directly include `prerequisiteTaskId`.',
    'benchmark-applicable manifests are generated from current route, frame, and projection records; callers do not author selectors or verdicts',
  ],
  skeleton: {
    schema: 'trusted-lifecycle-manifest-v1',
    entryPath: 'index.html',
    scripts: [{
      outcomeRef: '<exact required outcome ref from the current source contract>',
      actions: [{ kind: 'click', selector: '<stable action selector>' }],
      assertions: [{
        kind: 'visible-text',
        selector: '<state target selector>',
        text: '<exact visible success state>',
      }],
    }],
    entrySurface: {
      benchmarkProjectionSha256: '<sha256 of .omd/task-flow-benchmark-projection.json bytes>',
      prerequisiteTaskId: '<direct prerequisite task id>',
      dependentTaskId: '<task id whose dependsOn includes prerequisiteTaskId>',
      purpose: {
        selector: '[data-omd-purpose]',
        text: '<exact visible purpose>',
      },
      workObject: {
        selector: '[data-omd-work-object]',
        anchorSelector: '[data-omd-work-anchor]',
        anchorText: '<exact representative work-object label>',
      },
      nextAction: {
        selector: '[data-omd-next-action]',
        accessibleName: '<exact accessible action name>',
      },
      trigger: {
        kind: 'click',
        selector: '<prerequisite trigger inside work object>',
      },
      consequence: {
        selector: '<dependent state inside work object>',
        beforeText: '<exact initial text>',
        afterText: '<exact changed text>',
      },
    },
  },
};

const ENTRY_SURFACE_CONTRACT: InputSkeleton = {
  name: 'entry-surface-contract',
  path: '.omd/.cache/entry-surface-contract.json',
  command: 'omd frame set ... --entry-surface .omd/.cache/entry-surface-contract.json',
  keys: [
    'schema', 'entryPath', 'prerequisiteTaskId', 'dependentTaskId', 'purposeText',
    'workObjectAnchorText', 'nextActionName', 'beforeText', 'afterText', 'outcomeWitnesses',
  ],
  constraints: [
    'contains semantic task witnesses only; selector fields are forbidden',
    'outcomeWitnesses covers every mustHave, mustNotHave, and completionEvidence item exactly once and in canonical order',
    'mustNotHave uses absent-text; mustHave and completionEvidence use visible-text',
    'nextActionName is the exact dependent action name, or null when the edge ends in an observable consequence without another action',
    'task IDs are lowercase kebab-case and must form a direct edge in the current benchmark projection',
  ],
  skeleton: {
    schema: ENTRY_SURFACE_CONTRACT_SCHEMA,
    entryPath: 'index.html',
    prerequisiteTaskId: 'inspect-evidence',
    dependentTaskId: 'request-review',
    purposeText: '<exact visible task purpose>',
    workObjectAnchorText: '<exact truthful fixture or real work-object anchor>',
    nextActionName: null,
    beforeText: '<exact state before the prerequisite>',
    afterText: '<exact state after the prerequisite>',
    outcomeWitnesses: [
      {
        kind: 'mustHave', index: 0, phase: 'after-prerequisite', assertion: 'visible-text',
        target: 'consequence',
      },
      {
        kind: 'mustNotHave', index: 0, phase: 'initial', assertion: 'absent-text',
        target: 'body',
      },
      {
        kind: 'completionEvidence', index: 0, phase: 'after-prerequisite', assertion: 'visible-text',
        target: 'consequence',
      },
    ],
  },
};

const REFERENCE_CAPTURE_PREPARATION: InputSkeleton = {
  name: 'reference-capture-preparation',
  path: '.omd/.cache/reference-capture-preparation.json',
  command: 'omd ref add <url> --as menu --selector "#menu" --blueprint --shot --no-energy --preparation .omd/.cache/reference-capture-preparation.json',
  keys: ['schema', 'actions', 'assertions'],
  constraints: [
    'only caller-authored disclosure clicks: exactly one button[type=button] with aria-expanded and aria-controls pointing to an asserted element; no scripts, typing, submit, navigation, or inferred actions',
    '1 to 8 actions and 1 to 8 assertions; each assertion identifies exactly one existing element and observes visible or hidden',
    'ref add-batch entries embed this object as preparation and must explicitly set energy:false; ref add requires --no-energy',
    'IR, blueprint, and PNG use the prepared page; assertion failure publishes no new screenshot or reference record',
    'capturePreparation records executed actions, visibility observations, and actual viewport; this is not complete semantic state proof',
    'interaction-probe, motion-probe, and energy-curve are not measured; invariant compatibility defaults do not establish observed absence',
  ],
  skeleton: {
    schema: CAPTURE_PREPARATION_SCHEMA,
    actions: [{ kind: 'click', selector: '#menu-toggle' }],
    assertions: [{ selector: '#menu', state: 'visible' }],
  },
};

export const INPUT_SKELETONS: readonly InputSkeleton[] = [
  ROUTE_INPUT,
  REALITY_LEDGER,
  DOMAIN_BRIEF,
  DEPTH_INPUT,
  CONTENT_GRAIN,
  ACQUISITION_PLAN,
  REFERENCE_BOARD,
  REFERENCE_CAPTURE_PREPARATION,
  REFERENCE_LOCALE_BINDING,
  TASK_FLOW_BENCHMARK,
  ART_DIRECTION_CHECK,
  LOCALE_CONTRACT,
  LOCALE_DESIGN_CONTEXT,
  CULTURAL_DESIGN_PROFILE,
  FUNCTIONAL_REQUIREMENTS,
  DECISION_GRAPH,
  ENTRY_SURFACE_CONTRACT,
  TRUSTED_LIFECYCLE_MANIFEST,
];

export function inputSkeleton(name: string): InputSkeleton {
  const found = INPUT_SKELETONS.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`unknown schema ${name}; known: ${INPUT_SKELETONS.map((entry) => entry.name).join(', ')}`);
  }
  return found;
}
