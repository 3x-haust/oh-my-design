// Canonical skeletons for the inputs a coordinator authors by hand.
//
// Every one of these files is written into `.omd/` (or `.omd/.cache/`) by a chat agent, then
// validated by a CLI gate. Without a printable skeleton the agent reads `core/**` to recover the
// key list, which costs a stage retry when it guesses wrong. `omd schema <name>` prints these.

import { DEPTH_INPUT_KEYS, DEPTH_INPUT_SCHEMA, DEPTH_SCOPES } from '../deliberation/depth.ts';
import { TOKEN_COMMIT_SCHEMA, TOKEN_COMMIT_KEYS, RESPONSIVE_TOKEN_COMMIT_SCHEMA, RESPONSIVE_TOKEN_COMMIT_KEYS } from '../tokens/contract.ts';
import { CAPTURE_PREPARATION_SCHEMA } from '../ref/capture-preparation.ts';
import { EXECUTION_REQUIREMENT_GATES } from '../brief/execution-requirements.ts';
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
import { ROUTE_INPUT_KEYS, ROUTE_INPUT_SCHEMA, OPTIONAL_STAGE_IDS, OPTIONAL_METHOD_IDS } from '../route/index.ts';
import { ADAPTIVE_ATTRIBUTION_CATEGORIES } from '../route/adaptive-attribution.ts';
import { REFERENCE_DISCOVERY_TASK_NEEDS } from '../ref/reference-discovery-routing.ts';
import {
  TASK_FLOW_BENCHMARK_KEYS,
  TASK_FLOW_BENCHMARK_SCHEMA,
  TASK_FLOW_BENCHMARK_SURFACES,
} from '../ref/task-flow-benchmark.ts';
import { ENTRY_SURFACE_CONTRACT_SCHEMA } from '../frame/entry-surface-contract.ts';
import { DESIGN_QUALITY_OBSERVATION_PROJECTION_INPUT_SCHEMA } from '../evidence/final-v2-browser-observations.ts';
import { FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA } from '../runtime/final-render-review.ts';
import { FEATURE_QUANTITIES } from '../ref/feature-measurement.ts';
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
    'prepare current source-free lineage with omd art-direction check-input --input <alternatives.json> --json before evaluator launch; protocol/design-deliberation.md owns preparation and publication transport semantics',
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
    'every piece in one zone must truthfully match its one requiredState; split mandatory complementary states into separate required evidence zones with unique decision IDs, mapping each back to the original outcome and falsifier, rather than merging them into a vague state',
    'optional zone.evidenceRequirement is exactly {kind:"measured-component"|"visible-appearance",reason:"<non-empty source-free reason>"}; omission requires measured component anatomy; visible-appearance admits a current provenance-bound image for a static visual obligation, never internal DOM, fonts, interaction, motion or responsive behavior',
    'visible-appearance zones may request only structure, proportion, density or rhythm; keep every independently required measured, typography, behavior and production obligation separate and mandatory; choose the evidence kind for the question, not to excuse a failed capture',
    'Framer checks the actual question and falsifier: exact source ratios, gaps, font metrics and responsive comparisons require measurements even on static axes; the evidence reason states the appearance limit and separate proof; Scout independently verifies the pixels, and a coverage pass is not semantic or visual approval',
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
    'taskOutcome.mustHave, mustNotHave, and completionEvidence contain product/surface outcomes with browser-observable evidence. Preserve execution-only requirements verbatim in taskOutcome.executionRequirements instead of asking page text to prove authorship, scope, independent review, or future finalization. Keep the full original request in request. This partition is made before route publication; do not remove or reclassify a failed product behavior to make a published run pass.',
    `Optional taskOutcome.executionRequirements entries have exactly requirement and enforcedBy; enforcedBy is a nonempty unique subset of: ${EXECUTION_REQUIREMENT_GATES.join(', ')}. These are existing mandatory host gates, not caller verdicts or generic external verification. Unsupported requirements stay blocked; native mobile installation is not a browser or host-gate claim.`,
    'designAxes values: taskSize=small|medium|large; failureRisk=low|moderate|high; uxNeed=baseline|focused|rigorous; expressiveDesignNeed=restrained|balanced|showpiece. The art-direction register confident is not a designAxes value; balanced permits confident visual craft.',
    'Before choosing or skipping visual methods, read `omd pack protocol/human-design-loop.md --section "Visual reference gallery and concept exploration"`. An exploration skip names the current supplied direction or existing visible evidence that settles the content-to-form relationship. Functional simplicity, quietness, no metaphor, no shipped bitmap, or future review alone do not settle it. A bounded change to a current visual target may skip experiments; do not reopen that target or impose a candidate quota.',
    `referenceDiscovery.taskNeed is one of: ${REFERENCE_DISCOVERY_TASK_NEEDS.join(', ')}`,
    'referenceDiscovery.uncertainty is unresolved or resolved; existingEvidence is none, insufficient, or sufficient; a new marketing page uses new-marketing even when its user-supplied content is complete',
    'When projectMode is greenfield and referenceDiscovery.taskNeed is new-product, the task-flow benchmark requires stages scout, reference-board, composition and candidate-generation and roles omd-scout, omd-composer and omd-sketch. These are existing stage/role IDs, not a stage named task-flow. Keep dependency order and executionWaves valid; benchmark input and publication use omd schema task-flow-benchmark.',
    'For new-product, new-marketing, or unresolved discovery: uncertainty="unresolved", existingEvidence="none" or "insufficient", existingEvidenceUse=null, skipReason=null. Both null keys are required; do not omit them or replace null with explanatory prose.',
    'For skipped discovery on existing work: uncertainty="resolved", existingEvidence="sufficient", existingEvidenceUse and skipReason are non-empty descriptions of actual evidence use and the skip reason.',
    'the user-selected model owns role, stage, and method order',
    'executionWaves schedules every selected role exactly once; prerequisite owners precede consumer owners, and parallel-reference-acquisition puts Scout and Writer in the same wave',
    'every omitted optional stage or method carries a non-empty skip reason',
    `Optional stages: ${OPTIONAL_STAGE_IDS.join(', ')}. Optional methods: ${OPTIONAL_METHOD_IDS.join(', ')}. Account for each in its selected list or skips, including copy-repair-workflow when writing fresh copy without that repair method.`,
    `attributionCategories is the applicable subset in this exact order: ${ADAPTIVE_ATTRIBUTION_CATEGORIES.join(', ')}. Include tokens always, motion only with motion-one, composition only with the composition stage, and graphics only with nonempty aiAssets. Typography is not a category.`,
    'strategyDecision.aiAssets contains closed objects, never asset ID strings; print omd schema route-ai-asset for the item shape and native decision publication. ai-shipped-asset is selected exactly when aiAssets is nonempty. Image-first draft exploration does not itself select a shipped asset.',
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
      executionRequirements: [{ requirement: '<execution-only constraint from the request>', enforcedBy: ['project-write-boundary', 'independent-review', 'completion-preflight'] }],
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

const ROUTE_AI_ASSET: InputSkeleton = {
  name: 'route-ai-asset',
  path: '.omd/.cache/route-input.json (one strategyDecision.aiAssets item)',
  command: 'omd decision "<what>" --why "<reason>" --ai-asset-id <assetId> --prompt "<exact prompt>" --provider "<exact provider>" --json',
  keys: ['assetId', 'zone', 'prompt', 'provider', 'decision', 'currentDecision'],
  constraints: [
    'This skeleton is an item within route-input.strategyDecision.aiAssets, not a standalone CLI input or an AI decision record. Asset IDs must be unique lowercase kebab strings; zone is exactly abstract or atmospheric. Read omd pack theory/imagegen.md for the permitted role of shipped imagery.',
    'The native coordinator publishes the decision with its current host-issued command binding. Replace both decision placeholders with the complete aiAssetDecision object returned in actual JSON stdout. Never author, reconstruct, import from another invocation, or edit its record, hashes, project identity or invocation fields.',
    'prompt and provider are the exact nonempty values bound by that native decision. The route gate revalidates both against the committed current decision. Changing either requires a new genuine decision. Place identical, unmodified copies of the returned aiAssetDecision object in decision and currentDecision for that current choice.',
    'A nonempty aiAssets array requires ai-shipped-asset in methods, no contradictory skip, and graphics in the attribution order printed by omd schema route-input. When a concrete shipped asset is not yet selected, keep aiAssets empty with a truthful ai-shipped-asset skip; image-first-draft exploration may still be selected. After the actual decision, run omd route classify --input .omd/.cache/route-input.json --json with the current host-issued activation.',
    'Decision publication and route admission do not generate an image or prove asset suitability. Preserve actual generation provenance and every selected asset, art-direction, production and review obligation.',
  ],
  skeleton: {
    assetId: '<unique lowercase asset ID>',
    zone: 'abstract',
    prompt: '<exact actual prompt>',
    provider: '<exact actual provider>',
    decision: '<replace with the whole native stdout.aiAssetDecision object>',
    currentDecision: '<replace with the same whole native stdout.aiAssetDecision object>',
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
    'a persisted image fragment instead uses sourceKind="image-fragment" and referenceId="<id returned by omd ref import-image>"; omit source and component, retain the same zone/state/viewport/falsifier binding, and do not invent app DOM, font or reflow measurements from pixels',
    'image-fragment pieces resolve the current provenance-bound PNG and cannot declare motion evidence or binding.measurements; the importer JSON filename may be absolute, but its inputPath field is a project-relative image identity beneath .omd/refs',
    'for image-fragment bindings, sourceViewport is the observed browser capture viewport, not the original app viewport depicted inside the image; establish the capture size with a supported browser viewport operation and retain its actual result before capture; original app viewport and responsive reflow may remain unknown',
    'image fragments never count as measured component anatomy or waive a measured zone; a Framer-declared evidenceRequirement.kind="visible-appearance" zone may require their static visual evidence independently; all its state, viewport, provenance and pixel checks still apply',
    'binding agreement alone does not prove a depicted state or capture viewport, which Scout must independently observe and record rather than infer from raster dimensions',
    'optional binding.measurements declares the exact captured-node to destination-anchor correspondence; use omd schema reference-feature-measurements when whole-DOM correspondence does not represent the promised feature',
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

const REFERENCE_IMAGE_FRAGMENT: InputSkeleton = {
  name: 'reference-image-fragment',
  path: '.omd/.cache/reference-image-fragment-input.json',
  command: 'omd ref import-image .omd/.cache/reference-image-fragment-input.json --json',
  keys: ['inputPath', 'provenance', 'transfer'],
  constraints: [
    'import an actual authorized browser capture already saved as a valid PNG beneath the project .omd/refs directory; inputPath is project-relative, without symlinks, traversal, absolute paths or remote URLs; the importer does not fetch or capture images',
    'provenance requires sourcePage, captureRegion, licenseStatus, rightsNotes and capturedAt; its only permitted optional fields are sourceImage and cropBox; sourcePage and sourceImage are absolute HTTP(S) provenance URLs, never input images',
    'capturedAt is the actual capture time in canonical UTC ISO format with milliseconds; licenseStatus is allowed|restricted|unknown, and records rights without granting production reuse',
    'optional provenance.cropBox contains exactly x, y, width, height from the actual capture; x and y are finite non-negative numbers, width and height are finite positive numbers; omit when no crop was made',
    'transfer requires visualRole and non-empty principles; optional geometry describes the saved PNG with exactly width and height in pixels and aspectRatio = width / height, all finite positive numbers; it never describes invented app DOM, font or reflow measurements',
    'captureRegion, rightsNotes and every transfer string must omit source URLs, file paths and pixel payloads; source identities belong only in sourcePage/sourceImage',
    'the source-free text grammar also rejects path-shaped slash-separated words; spell alternatives or paired concepts out (for example, period and location), preserving the observation rather than changing evidence or identifiers to pass',
    'all omitted optional fields stay absent, not null; do not add schemaVersion, id, sha256 or imagePath to input: the publisher produces the immutable record and its identity',
    'image fragments supply appearance evidence, never measured component anatomy, motion or interaction; a Framer-declared visible-appearance zone may require them, while measured obligations remain separate; reference-board owns downstream coverage, binding and selection',
  ],
  skeleton: {
    inputPath: '.omd/refs/<actual-browser-capture>.png',
    provenance: {
      sourcePage: '<original absolute HTTP(S) page URL>',
      captureRegion: '<region actually visible in the saved browser capture>',
      licenseStatus: 'unknown',
      rightsNotes: '<observed rights and restrictions; source pixels are not a production asset>',
      capturedAt: '<actual capture timestamp: YYYY-MM-DDTHH:mm:ss.sssZ>',
    },
    transfer: {
      visualRole: '<visible relationship this image supports>',
      principles: ['<source-free observed principle with the static evidence limit>'],
    },
  },
};

const REFERENCE_FEATURE_MEASUREMENTS: InputSkeleton = {
  name: 'reference-feature-measurements',
  path: '.omd/.cache/candidate-assemblies.json → each relevant piece.binding.measurements',
  command: 'omd ref board --input .omd/.cache/candidate-assemblies.json --json; then omd ref verify <page> --candidate <id> --json',
  keys: ['id', 'quantity', 'sourceNodes', 'targetAnchors'],
  constraints: [
    'this is an optional measurements array inside an existing component influence binding, not a standalone publisher or a replacement acquisition plan',
    'use 1..24 distinct feature ids; sourceNodes are zero-based indices in the CURRENT captured blueprint, shown by ref verify sourceBlueprint; never guess indices from a screenshot',
    'targetAnchors name meaningful complete destination groups through data-omd-reference-anchor="name"; @root is the existing complete targetSelector scope; names are lowercase kebab identifiers of at most 64 characters',
    'width and height use one source node and one target anchor; all other quantities use two DISTINCT source nodes and two DISTINCT target anchors, in the declared order',
    ...Object.entries(FEATURE_QUANTITIES).map(([quantity, axes]) => `${quantity}: allowed primary axes ${axes.join('|')}`),
    'gap-x/y is the second start edge minus the first end edge; relative gaps divide by the component width/height; offsets are second start edge minus first start edge',
    'declare every load-bearing named relationship before production. Do not choose a trivial node, move markers away from the semantic group, trim content, change an axis or add extra copy to improve a score',
    'the selected-distance gate uses the weakest declared feature and retains the whole-component diagnostic separately; the existing threshold is unchanged',
    'missing, duplicate, hidden, out-of-scope or unmeasurable target anchors fail; source recapture, changed definitions, or changed build requires fresh current evidence',
    'one-pixel rounding tolerance applies only to zero absolute gaps/offsets; other distances and ratios compare min/max and preserve sign; no score is a perceptual percentage or semantic-transfer proof',
    'measurements apply at the captured source viewport. Required responsive viewports and visible feature/falsifier inspection remain separate obligations',
  ],
  skeleton: [{ id: 'display-to-body', quantity: 'font-size-ratio', sourceNodes: ['<measured display node index>', '<measured body node index>'], targetAnchors: ['display', 'body'] }],
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
    `surface accepts only ${TASK_FLOW_BENCHMARK_SURFACES.join(', ')}. Preserve the frame\'s applicable surface grammar (theory/ux.md, Surface types); domain names the actual category. Editorial reading, section-navigation and saved-reading flows can satisfy a route-selected task-flow benchmark without becoming a product work surface. This does not require a benchmark for every editorial page or change the route. If no allowed value truthfully fits, report the contract gap instead of relabeling it to pass.`,
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
    '`omd lifecycle plan` is benchmark-only. For other routes, author this manifest, omit entrySurface entirely, then use `omd lifecycle run --project . --manifest <path> --activation <host-issued-invocation.json>`.',
    'scripts uses canonical short outcomeRef values (mustHave:0, mustHave:1, mustNotHave:0, completionEvidence:0), not requirement prose or hashed outcome refs; cover every current task-outcome item exactly once in mustHave, mustNotHave, completionEvidence order.',
    'Each script has nonempty assertions: absent-text for mustNotHave; visible-text for mustHave and completionEvidence. The current browser evaluator cannot verify source/build, filesystem scope, review completion, or future finalization. Execution-only requirements belong in the original route taskOutcome.executionRequirements and are checked by their named host gates, not browser scripts; do not substitute page text for these requirements or silently remove them from the task contract. Do not omit a product behavior or silently rewrite a published task contract.',
    '`benchmarkProjectionSha256` is the SHA-256 of the current projection file bytes.',
    '`dependentTaskId.dependsOn` must directly include `prerequisiteTaskId`.',
    'benchmark-applicable manifests are generated from current route, frame, and projection records; callers do not author selectors or verdicts',
  ],
  skeleton: {
    schema: 'trusted-lifecycle-manifest-v1',
    entryPath: 'index.html',
    scripts: [{
      outcomeRef: 'mustHave:0',
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
    'executionRequirements is source-bound host-gate data, not an outcomeWitness kind. Do not invent a DOM witness for it. If execution-only prose was placed in a browser outcome, return the exact classification error to the coordinator; do not delete, reinterpret, or publish a textual proxy for that requirement.',
    'mustNotHave uses absent-text; mustHave and completionEvidence use visible-text',
    'nextActionName is the exact dependent action name, or null when the edge ends in an observable consequence without another action',
    'task IDs are canonical frame IDs (T1, T2, ...) or lowercase kebab-case, at most 64 characters; preserve exact IDs from a direct edge in the current benchmark projection',
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
    '0 to 8 actions and 1 to 8 assertions; empty actions observe initial state without probing; each assertion identifies exactly one existing element and observes visible or hidden',
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

const DESIGN_QUALITY_OBSERVATION_PROJECTION_INPUT: InputSkeleton = {
  name: 'design-quality-observation-projection',
  path: '.omd/.cache/design-quality-observation-projection-input.json',
  command: 'omd review evidence-projection --input .omd/.cache/design-quality-observation-projection-input.json --json',
  keys: ['schema', 'observationSha256s'],
  constraints: [
    'observationSha256s contains the unique aggregate observation-v2 record digests that the final lane will publish, never nested browser observation IDs or capture hashes',
    'the command revalidates the current decision graph, aggregate records, screenshot hashes, and PNG dimensions before emitting a source-free mapping',
    'embed the complete emitted mapping in both final blind Eye inputs; evidence viewport and state values are copied from it exactly',
  ],
  skeleton: {
    schema: DESIGN_QUALITY_OBSERVATION_PROJECTION_INPUT_SCHEMA,
    observationSha256s: ['<aggregate observation-v2 SHA-256>'],
  },
};

const FINAL_RENDER_REVIEWER_PACKET_INPUT: InputSkeleton = {
  name: 'final-render-reviewer-packet',
  path: '.omd/.cache/final-render-reviewer-packet-input.json',
  command: 'omd review final-packet --input .omd/.cache/final-render-reviewer-packet-input.json --activation "$OMD_ACTIVATION_PATH" --json',
  keys: ['schema', 'observationSha256s'],
  constraints: [
    'observationSha256s is the complete unique predecessor chain intended for the final lane and ends at the current observation-v2 pointer',
    'the command revalidates current route/source/build/outcome authority, decision links, and fixed desktop/mobile production PNG bytes before publishing',
    'the packet contains anonymous production pixels only; it exposes no capture path, tested URL, source identity, rationale, reference pixel, or prior verdict',
    'launch exactly two fresh Eyes with the resulting content-addressed packet; caller-authored review prose cannot replace the host-owned neutral task',
  ],
  skeleton: {
    schema: FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA,
    observationSha256s: ['<aggregate observation-v2 SHA-256>'],
  },
};

const TOKEN_COMMIT: InputSkeleton = {
  name: 'token-commit',
  path: '.omd/tokens.json',
  command: 'omd tokens check --json',
  keys: TOKEN_COMMIT_KEYS,
  constraints: [
    'the authorized owner writes .omd/tokens.json; tokens check validates only and never publishes or copies an --input file',
    'quoted numeric placeholders are documentation only: replace each scale placeholder with JSON numbers, not quoted strings; register is a non-empty string from the current direction, not a closed enum; only quiet and product waive the 2.5 total-span floor, never rung-count or adjacent-ratio floors',
    'replace placeholders with approved values, not new design decisions: typeScale is positive finite ascending unique px, at least 4 rungs, adjacent ratio >= 1.15, total span >= 2.5 unless register is quiet or product',
    'spacingScale is positive finite ascending unique px with at least 4 rungs; colorRoles and fontRoles are non-empty string maps and colorRoles requires accent',
    'use responsive-token-commit when approved type scales differ by viewport; do not union mutually exclusive sizes or change approved typography to make a union pass',
  ],
  skeleton: {
    schema: TOKEN_COMMIT_SCHEMA,
    register: '<current register>',
    typeScale: ['<approved font sizes in px>'],
    spacingScale: ['<approved spacing rungs in px>'],
    colorRoles: { accent: '<approved accent>', background: '<approved background>', text: '<approved text>' },
    fontRoles: { text: '<approved font family>' },
  },
};

const RESPONSIVE_TOKEN_COMMIT: InputSkeleton = {
  ...TOKEN_COMMIT,
  name: 'responsive-token-commit',
  keys: RESPONSIVE_TOKEN_COMMIT_KEYS,
  constraints: [
    ...TOKEN_COMMIT.constraints!,
    'responsiveTypeScales is non-empty, with exactly maxWidth and typeScale per entry; replace the quoted maxWidth placeholder with a JSON number; positive finite maxWidth values strictly ascend without duplicates',
    'maxWidth is an inclusive CSS viewport-width cap; first matching entry wins; top-level typeScale applies above all caps; each scale independently meets the same floors',
    'choose caps from the approved responsive proof; spacing/color/font roles remain shared; page drift checks use only the active scale at the supplied --viewport, never the union; check every approved viewport',
  ],
  skeleton: {
    ...TOKEN_COMMIT.skeleton as object,
    schema: RESPONSIVE_TOKEN_COMMIT_SCHEMA,
    responsiveTypeScales: [{ maxWidth: '<approved inclusive CSS width cap in px>', typeScale: ['<approved font sizes for this width range in px>'] }],
  },
};

export const INPUT_SKELETONS: readonly InputSkeleton[] = [
  ROUTE_INPUT,
  ROUTE_AI_ASSET,
  REALITY_LEDGER,
  DOMAIN_BRIEF,
  DEPTH_INPUT,
  CONTENT_GRAIN,
  ACQUISITION_PLAN,
  REFERENCE_BOARD,
  REFERENCE_IMAGE_FRAGMENT,
  REFERENCE_FEATURE_MEASUREMENTS,
  REFERENCE_CAPTURE_PREPARATION,
  REFERENCE_LOCALE_BINDING,
  TASK_FLOW_BENCHMARK,
  ART_DIRECTION_CHECK,
  TOKEN_COMMIT,
  RESPONSIVE_TOKEN_COMMIT,
  LOCALE_CONTRACT,
  LOCALE_DESIGN_CONTEXT,
  CULTURAL_DESIGN_PROFILE,
  FUNCTIONAL_REQUIREMENTS,
  DECISION_GRAPH,
  ENTRY_SURFACE_CONTRACT,
  FINAL_RENDER_REVIEWER_PACKET_INPUT,
  TRUSTED_LIFECYCLE_MANIFEST,
  DESIGN_QUALITY_OBSERVATION_PROJECTION_INPUT,
];

export function inputSkeleton(name: string): InputSkeleton {
  const found = INPUT_SKELETONS.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`unknown schema ${name}; known: ${INPUT_SKELETONS.map((entry) => entry.name).join(', ')}`);
  }
  return found;
}
