// Canonical skeletons for the inputs a coordinator authors by hand.
//
// Every one of these files is written into `.omd/` (or `.omd/.cache/`) by a chat agent, then
// validated by a CLI gate. Without a printable skeleton the agent reads `core/**` to recover the
// key list, which costs a stage retry when it guesses wrong. `omd schema <name>` prints these.

import { DEPTH_INPUT_KEYS, DEPTH_INPUT_SCHEMA, DEPTH_SCOPES } from '../deliberation/depth.ts';
import { DESIGN_JUDGMENT_INPUT } from './design-judgment.ts';
import { CANDIDATE_SELECTION_INPUT } from './candidate-selection.ts';
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
import { ROUTE_INPUT_KEYS, ROUTE_INPUT_SCHEMA, MANDATORY_STAGE_IDS, OPTIONAL_STAGE_IDS, OPTIONAL_METHOD_IDS } from '../route/index.ts';
import { ADAPTIVE_ATTRIBUTION_CATEGORIES } from '../route/adaptive-attribution.ts';
import { REFERENCE_DISCOVERY_TASK_NEEDS } from '../ref/reference-discovery-routing.ts';
import {
  TASK_FLOW_BENCHMARK_KEYS,
  TASK_FLOW_BENCHMARK_SCHEMA,
  TASK_FLOW_BENCHMARK_SURFACES,
} from '../ref/task-flow-benchmark.ts';
import {
  REFERENCE_RESEARCH_KEYS,
  REFERENCE_RESEARCH_SCHEMA,
} from '../ref/reference-research.ts';
import { ENTRY_SURFACE_CONTRACT_SCHEMA } from '../frame/entry-surface-contract.ts';
import { FRAME_INPUT_KEYS } from '../frame/input.ts';
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
    'marketAuthorityClaimId is null without a market; an explicit market binds to a confirmed evidenceClaims.userFacts claim sourced from the user',
    'locale-mechanics-only withholds every market-aesthetic claim',
    'brandInvariants contains unique visible strings and may be explicitly empty',
  ],
  skeleton: {
    schema: LOCALE_DESIGN_CONTEXT_SCHEMA,
    conversationLanguage: 'ko-KR',
    surfaceLocale: 'ja-JP',
    marketRegion: null,
    marketAuthorityClaimId: null,
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
  path: '.omd/.cache/functional-requirements.json',
  command: 'omd complete set --input .omd/.cache/functional-requirements.json --json',
  constraints: ['Publish with complete set; do not directly write the CLI-owned .omd/functional-requirements.json. This is not the frame task coverage matrix. Rendered completeness is checked later with complete check <page>.'],
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

const FRAME_INPUT: InputSkeleton = {
  name: 'frame', path: '.omd/.cache/frame-input.json',
  command: 'omd frame set --input .omd/.cache/frame-input.json', keys: FRAME_INPUT_KEYS,
  constraints: [
    'Use the current user brief and actual observations, never the example as evidence. Publish the complete frame atomically; frame show is inspection, frame check validates UX anchors.',
    'uxSurface is marketing, product, editorial, or mixed. Product/mixed requires the seven-field taskCoverageMatrix string; marketing/editorial must omit it. Each task uses a unique T1, T2, ... ID.',
    'viewports is desktop,mobile or one of them; requirements is none or invalid-submit,transient. Only recovery may use N/A: <reason>.',
    'Greenfield Copy consumes this frame\'s reality ledger; unknown facts do not ship and demo facts stay labelled. For a selected benchmark, add entrySurface from omd schema entry-surface-contract after the actual benchmark exists.',
  ],
  skeleton: {
    schema: 'frame-input-v1', problem: '<user task and current difficulty>', reframe: '<evidence-grounded framing>',
    why: '<cite the exact user sentence or observed evidence>', uxTask: '<task>', uxFrequentAction: '<action>',
    uxCostliestError: '<error and recovery>', uxSurface: 'product',
    taskCoverageMatrix: 'T1 | goal: <goal> | start: <entry state> | actions: <actions> | success: <observable result> | recovery: <recovery path> | viewports: desktop,mobile | requirements: none',
    reality: { schema: 'reality-ledger-v1', mode: 'greenfield', facts: [{ category: 'subject', status: 'supplied', statement: '<actual user-supplied fact>' }] },
  },
};

const DOMAIN_BRIEF: InputSkeleton = {
  name: 'domain-brief',
  path: '.omd/domain-brief.json',
  command: 'omd domain check --input .omd/domain-brief.json --json',
  keys: ['schema', 'request', 'domain', 'summary', 'surfaces', 'coreObjects', 'audience', 'referenceQueries', 'planning'],
  constraints: ['domain check validates structure, not planning confirmation. Each planning statement needs its own genuine userEvidence before production. Check the original request first; ask only for facts it does not supply. Do not silently invent prototype-only non-goals or copy the placeholders as evidence.'],
  skeleton: {
    schema: DOMAIN_BRIEF_SCHEMA,
    request: '<the raw request, normalized>',
    domain: '<the domain in a few words>',
    summary: '<one line: what this domain is and does>',
    surfaces: [{
      name: '<canonical page or screen>',
      purpose: '<the task it serves, one clause>',
      evidence: [{ status: '<observed|user-provided|inferred>', reference: '<URL or project-relative capture path>' }],
    }],
    coreObjects: [
      { name: '<a real noun the domain manipulates>', evidence: [{ status: 'observed', reference: '<URL or project-relative capture path>' }] },
    ],
    audience: {
      description: '<who the work is for>',
      evidence: [{ status: 'user-provided', reference: '<user-message or artifact path>' }],
    },
    referenceQueries: {
      component: ['<detailed component or section design query>'],
      craft: ['<motion, scroll, or sculptural craft query>'],
      mood: ['<felt direction: material, temperature, era, register — never a measurement>'],
    },
    planning: {
      businessGoal: {
        text: '<why this work exists, in the user\'s terms>',
        userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: '<message or artifact>', excerpt: '<what the user actually said>' }],
      },
      successSignal: {
        text: '<the observable change that means it worked; omit userEvidence to leave it an open hypothesis>',
        userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: '<message or artifact>', excerpt: '<the actual success criterion the user supplied>' }],
      },
      nonGoals: [{ text: '<what this release deliberately does not do>',
        userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: '<message or artifact>', excerpt: '<the actual exclusion the user supplied>' }] }],
    },
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
  command: 'omd route validate --input .omd/.cache/route-input.json --json',
  keys: ROUTE_INPUT_KEYS,
  constraints: [
    'Choose the starter by task: product-route-input for a new product implementation, design-route-input for design-only delivery, route-input for existing/bounded work. Starters are examples, not permission to change risk, facts, scope or optional-method decisions.',
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
    'Implementation stages must end with browser-evidence, independent-review, after production. final-evidence-v2 is a gate, not a stage. High failureRisk requires stage safety-validation (omd-writer), an enforced hard_safety_rail, and methods design-strategy-safety-recovery and rigorous-task-accessibility-validation. Inspect brief safety-validation for its existing contracts, not an invented safety role or schema.',
    'A selected stage/method must not also be in skips. Greenfield always selects frame; remove the example frame skip when using this skeleton for a new product.',
    'For design and handoff before implementation, use omd schema design-route-input. Its deliveryMode=design-only forbids production and application paths. Do not add production merely to pass an implementation-route validator.',
    'uxPolicy kinds are hard_safety_rail (enforced), required_outcome (required), recommended_method (selected|skipped with reason), free_choice (selected|skipped). Safety, recovery and accessibility are topics/ids, not kinds. designAxes.schema must be design-axis-input-v1.',
    'First run route validate, repair each named error and retry; validation is read-only and does not need activation. Then route classify publishes the valid input. Pi uses omd_cli without --activation; a genuine supplied Codex activation remains host-owned.',
    'executionWaves schedules every selected role exactly once; prerequisite owners precede consumer owners, and parallel-reference-acquisition puts Scout and Writer in the same wave. mode is always concurrent (including one-role waves); waves run in array order. sequential and parallel are not mode values. Pi may execute roles within a wave sequentially when no delegation is available.',
    'When discovery is selected, methods must include reference-discovery AND parallel-reference-acquisition; the latter is a method, not a stage, and also requires selected Scout and Writer in the same wave. A hypothesis claim requires hypothesis-validation. route validate --json reports independent diagnostic groups together; repair them together without inventing methods or removing needed work.',
    'every omitted optional stage or method carries a non-empty skip reason',
    `Optional stages: ${OPTIONAL_STAGE_IDS.join(', ')}. Mandatory stages: ${MANDATORY_STAGE_IDS.join(', ')} — always selected, never skipped. Optional methods: ${OPTIONAL_METHOD_IDS.join(', ')}. Account for each optional stage and method in its selected list or skips, including copy-repair-workflow when writing fresh copy without that repair method.`,
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
      stages: ['domain', 'copy', 'production', 'browser-evidence', 'independent-review'],
      executionWaves: [
        { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
        { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
        { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
      ],
      methods: [
        'design-strategy-balanced-delivery', 'model-capability-probe', 'evidence-claim-accounting', 'hypothesis-validation',
        'decision-linked-browser-observation', 'copy-repair-workflow',
      ],
      aiAssets: [],
      attributionCategories: ['tokens'],
      skips: [
        { id: 'reference-discovery', reason: '<existing evidence is sufficient>' },
        { id: 'visual-craft', reason: '<gathering a visual direction is the default; omit only when the route declares restrained expression or a supplied brand fixed the direction>' },
        { id: 'depth', reason: '<no deep deliberation needed>' },
        { id: 'frame', reason: '<no framing change>' }, { id: 'acquisition', reason: '<no acquisition needed>' },
        { id: 'content-grain', reason: '<existing content morphology is unchanged>' },
        { id: 'moodboard', reason: '<existing visual direction is unchanged>' },
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
    'copy the exact root and nested key sets; do not rename, duplicate, nest, or extend fields. Each flow may carry execution:{path,sha256}; selected product benchmarks require the signed receipt returned by benchmark record for each completed flow. Omit execution only for explicitly unverified historical/optional evidence.',
    `surface accepts only ${TASK_FLOW_BENCHMARK_SURFACES.join(', ')}. Preserve the frame\'s applicable surface grammar (theory/ux.md, Surface types); domain names the actual category. Editorial reading, section-navigation and saved-reading flows can satisfy a route-selected task-flow benchmark without becoming a product work surface. This does not require a benchmark for every editorial page or change the route. If no allowed value truthfully fits, report the contract gap instead of relabeling it to pass.`,
    'sources contains 3..6 independently inspected sources and at least three same-domain-service sources from distinct service families; pages or subdomains under one operator such as GOV.UK count once, and same-domain services must outnumber adjacent-domain services',
    'each source records every safe reachable screen in its declared scope, every discovered target as either inspected or explicitly excluded, and a connected reachedBy path from an entry screen',
    'coverage.status is complete only with zero exclusions; bounded-gap requires explicit authentication, payment, destructive-action, rate-limit, blocked, out-of-scope, or unavailable exclusions with reasons',
    'coverage.excludedTargets is an array of objects with exactly id, url, category, reason: a unique nonempty id, the actual discovered HTTPS url, one of the exclusion categories above, and a nonempty observed reason. Never replace these objects with strings or omit discovered targets to claim complete coverage. coverage.discoveredTargetCount must equal screens.length + excludedTargets.length.',
    'screens bind current local browser evidence under .omd/refs/; every flow step has distinct current evidence, a concrete action, and its observed result',
    'features group observed behavior by real screen ids; flows organize the clicked sequence by user intent. Every inspected screen must appear in at least one feature or flow',
    'a service source needs at least one completed flow. Record blocked attempts with a limitation instead of claiming completion',
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
        kind: 'same-domain-service',
        observedAt: '2026-08-25',
        coverage: {
          scope: 'public repair service overview and detail pages reachable from the supplied entry page',
          status: 'bounded-gap',
          discoveredTargetCount: 3,
          entryScreenIds: ['a-intake'],
          inspectedScreenIds: ['a-intake', 'a-review'],
          excludedTargets: [{
            id: 'a-account',
            url: 'https://example.com/repair-booking-a/account',
            category: 'authentication',
            reason: 'The discovered account link requires sign-in; account access was not attempted.',
          }],
        },
        screens: [
          {
            id: 'a-intake', name: 'Service overview', url: 'https://example.com/repair-booking-a', state: 'overview-visible',
            reachedBy: { fromScreenId: null, action: 'observe current screen', result: 'visible: main h1' },
            evidence: { path: '.omd/refs/task-flows/service-a-intake.png', sha256: '1'.repeat(64) },
          },
          {
            id: 'a-review', name: 'Service details', url: 'https://example.com/repair-booking-a/details', state: 'details-visible',
            reachedBy: { fromScreenId: 'a-intake', action: 'click: a[data-details]', result: 'visible: #details' },
            evidence: { path: '.omd/refs/task-flows/service-a-review.png', sha256: '2'.repeat(64) },
          },
        ],
        features: [{ id: 'a-issue-capture', name: 'Inspect service details', behavior: 'links the service overview to public requirements', screenIds: ['a-intake', 'a-review'] }],
        flows: [{
          id: 'a-request-review', intent: 'inspect service information before any request', status: 'completed', limitation: null,
          execution: { path: `.omd/refs/domain/flows/executions/${'a'.repeat(64)}.json`, sha256: 'a'.repeat(64) },
          steps: [
            { order: 1, screenId: 'a-intake', action: 'observe current screen', result: 'visible: main h1', evidence: { path: '.omd/refs/task-flows/service-a-flow-1.json', sha256: '3'.repeat(64) } },
            { order: 2, screenId: 'a-review', action: 'click: a[data-details]', result: 'visible: #details', evidence: { path: '.omd/refs/task-flows/service-a-flow-2.json', sha256: '4'.repeat(64) } },
          ],
        }],
        observedPatterns: ['public requirements are reachable from the overview'],
        forbiddenTransfers: ['brand, pricing, availability, and service promises'],
      },
      {
        id: 'service-b',
        url: 'https://example.org/repair-booking-b',
        kind: 'same-domain-service',
        observedAt: '2026-08-25',
        coverage: {
          scope: 'public service categories and preparation guidance',
          status: 'complete',
          discoveredTargetCount: 2,
          entryScreenIds: ['b-triage'],
          inspectedScreenIds: ['b-triage', 'b-review'],
          excludedTargets: [],
        },
        screens: [
          {
            id: 'b-triage', name: 'Service categories', url: 'https://example.org/repair-booking-b', state: 'categories-visible',
            reachedBy: { fromScreenId: null, action: 'observe current screen', result: 'visible: #categories' },
            evidence: { path: '.omd/refs/task-flows/service-b-triage.png', sha256: '5'.repeat(64) },
          },
          {
            id: 'b-review', name: 'Preparation guidance', url: 'https://example.org/repair-booking-b/guide', state: 'guidance-visible',
            reachedBy: { fromScreenId: 'b-triage', action: 'click: a[data-guide]', result: 'visible: #guide' },
            evidence: { path: '.omd/refs/task-flows/service-b-review.png', sha256: '6'.repeat(64) },
          },
        ],
        features: [{ id: 'b-triage-review', name: 'Preparation guidance', behavior: 'links service categories to preparation guidance', screenIds: ['b-triage', 'b-review'] }],
        flows: [{
          id: 'b-review-before-commitment', intent: 'inspect preparation guidance before any request', status: 'completed', limitation: null,
          execution: { path: `.omd/refs/domain/flows/executions/${'b'.repeat(64)}.json`, sha256: 'b'.repeat(64) },
          steps: [
            { order: 1, screenId: 'b-triage', action: 'observe current screen', result: 'visible: #categories', evidence: { path: '.omd/refs/task-flows/service-b-flow-1.json', sha256: '7'.repeat(64) } },
            { order: 2, screenId: 'b-review', action: 'click: a[data-guide]', result: 'visible: #guide', evidence: { path: '.omd/refs/task-flows/service-b-flow-2.json', sha256: '8'.repeat(64) } },
          ],
        }],
        observedPatterns: ['preparation guidance is available before any commitment'],
        forbiddenTransfers: ['brand, copy, policies, and operational claims'],
      },
      {
        id: 'service-c',
        url: 'https://example.net/repair-booking-c',
        kind: 'same-domain-service',
        observedAt: '2026-08-25',
        coverage: {
          scope: 'public requirements and review guidance', status: 'complete', discoveredTargetCount: 2,
          entryScreenIds: ['c-requirements'], inspectedScreenIds: ['c-requirements', 'c-review'], excludedTargets: [],
        },
        screens: [
          { id: 'c-requirements', name: 'Requirements', url: 'https://example.net/repair-booking-c', state: 'requirements-visible',
            reachedBy: { fromScreenId: null, action: 'observe current screen', result: 'visible: #requirements' },
            evidence: { path: '.omd/refs/task-flows/service-c-requirements.png', sha256: '9'.repeat(64) } },
          { id: 'c-review', name: 'Review guidance', url: 'https://example.net/repair-booking-c/review', state: 'review-visible',
            reachedBy: { fromScreenId: 'c-requirements', action: 'click: a[data-review]', result: 'visible: #review' },
            evidence: { path: '.omd/refs/task-flows/service-c-review.png', sha256: 'a'.repeat(64) } },
        ],
        features: [{ id: 'c-requirement-review', name: 'Requirement review', behavior: 'keeps requirements visible before commitment', screenIds: ['c-requirements', 'c-review'] }],
        flows: [{ id: 'c-review-before-commitment', intent: 'review requirements before any request', status: 'completed', limitation: null,
          execution: { path: `.omd/refs/domain/flows/executions/${'c'.repeat(64)}.json`, sha256: 'c'.repeat(64) },
          steps: [
            { order: 1, screenId: 'c-requirements', action: 'observe current screen', result: 'visible: #requirements', evidence: { path: '.omd/refs/task-flows/service-c-flow-1.json', sha256: 'b'.repeat(64) } },
            { order: 2, screenId: 'c-review', action: 'click: a[data-review]', result: 'visible: #review', evidence: { path: '.omd/refs/task-flows/service-c-flow-2.json', sha256: 'c'.repeat(64) } },
          ] }],
        observedPatterns: ['requirements remain visible before commitment'],
        forbiddenTransfers: ['brand, eligibility, guarantees, and service promises'],
      },
    ],
    taskSteps: [
      {
        id: 'understand-service',
        intent: 'understand the relevant service and its requirements',
        dependsOn: [],
        evidenceSourceIds: ['service-a', 'service-b', 'service-c'],
      },
      {
        id: 'prepare-request',
        intent: 'inspect preparation guidance before starting a request',
        dependsOn: ['understand-service'],
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

const REFERENCE_RESEARCH: InputSkeleton = {
  name: 'reference-research',
  path: '.omd/.cache/reference-research.json',
  command: 'omd ref research-set --input .omd/.cache/reference-research.json',
  keys: REFERENCE_RESEARCH_KEYS,
  constraints: [
    'domainReference and designReference are both required and cannot substitute for one another',
    'new v7 domainReference.sources contains at least three independently inspected comparable services from three distinct service families; multiple GOV.UK pages/subdomains or any other single operator count as one family. Historical v5/v6 remain readable but cannot satisfy a current explicit-market route without v7 market coverage.',
    'current v7 designReference.sources contains at least two visual-direction sources from independent original service families and distinct inspected gallery items. Their retained PNG bytes must differ, and both visual directions must participate in the current board. Repeated pages, crops, aliases, or capture names from one product count once.',
    'v7 supports actual search or direct-public discovery, independently per lane. queries and searches remain required arrays: every declared query needs an exact execution receipt, even with direct roots. Both arrays may be empty only with nonempty valid discoveryRoots. Historical v5/v6 remain readable unchanged; never relabel old receipts.',
    'For search, run omd ref search --input <json> with {lane: domain|design, query, url, queryParam}; the HTTPS URL must carry that exact query. Put returned receipt(s) in searches. Every non-user source/entry must occur in actual observed links and have a separate native visit capture. Blocked attempts may remain alongside a successful public alternative. Never author search receipts by hand.',
    'For direct discovery, run ref navigate <public-list-url> --lane domain --entry public-directory --json or --lane design --entry free-gallery --json. Put the returned method, entry, url, evidence and capture plus your reason in discoveryRoots. Only the native entry publisher can create this receipt; old navigation captures cannot be promoted. Design roots must be supported freely visible gallery lists with actual item links, not selected items, login walls or arbitrary services. Discovery roots prove visited lists and links, not quality, official authority or a retained reference.',
    'search execution accepts Google/Bing/DuckDuckGo q endpoints and design-only Pinterest /search/pins/?q=, Dribbble /search/<query-slug> with queryParam=path, and Siteinspire /search?query=. Use the executable designSourcePolicy.nativeSearchInputs from ref discover-plan and adapt the query and URL together. Arbitrary service query fields are not search evidence.',
    'when ref discover-plan v2 returns marketReferencePolicy.mode=target-market-first, v7 marketCoverage is required. Execute its exact domainSearchInputs and market-and-domain-qualified design inputs before unqualified global searches. Each lane classifies every source id exactly once as localSources=[{sourceId,evidenceSha256,scope,basis,provenanceReceiptSha256}] or global fallback. The digest must bind the retained source image. basis=market-search-result requires the exact signed market-search receipt whose visible result text for that link names the explicit market and relevant service/product scope. basis=market-direct-result requires the exact signed direct-public root receipt whose visible label for that retained link names the explicit market and relevant scope. URL tokens, localized queries, country-code hostnames, page-wide headings, and freeform reasons are not source-specific market proof. Search and direct bases may coexist in a lane. Every declared search and direct attempt must be current. Every fallback provides provenance=[{sourceId,provenanceReceiptSha256}] binding each chosen global source to a current signed visible link, and its gap records the exact marketRegion, availability|access|coverage kind, exact attemptedQueries, and exact attemptedRoots used by that lane. Every chosen retained capture must be current.',
    'each lane records actual discovery, inspected sources and current PNG evidence plus a hashed native capture JSON; domain paths stay in .omd/refs/domain/, design source and sources[i].discovery evidence/capture receipts stay in .omd/refs/design/, and .omd/discovery/<lane>/ receipts belong only in searches, discoveryRoots or navigation, never retained gallery discovery',
    'research-set publishes .omd/refs/domain/research.json and .omd/refs/design/research.json separately, then .omd/reference-research.json as a consistency receipt; research-check requires all three current records',
    'neither the same evidence path nor identical bytes under a renamed path can satisfy both lanes',
    'domain and design sources/discovery entries must use independent service hosts (also checked after redirects). A new crop, path, query or filename of the same service is not a separate lane.',
    'design sources declare visualRole=visual-direction|component-support and visualAssessment={composition,typography,density,imagery,transfer,avoid}. Inspect actual pixels; none of these fields is an automatic beauty score. Each board candidate must use a visual-direction source; support-only documentation is insufficient.',
    'non-user discovery must be a concrete supported gallery item: Pinterest pin, Dribbble shot, Behance gallery, Siteinspire/Land-book website, Godly website, or UI Bowl public item. These are free-access leads, not guaranteed free catalogues. Paid MCP is not needed. If every available source is blocked, report incomplete research; do not relabel domain pages.',
    'every design source needs discovery: a non-homepage gallery/pin entry URL, kind (app-gallery, web-gallery, visual-bookmark, or explicitly user-provided), access free, qualityReason, evidence and capture receipts. If the retained source differs from the gallery URL, the captured gallery acquisition.links must contain that exact source URL; otherwise retain the gallery image as visual-only, not an unrelated component',
    'capture points to the JSON returned by ref add --lane domain|design or ref import-image; never create or repair acquisition metadata by hand. Native captures bind source, imagePath, actual HTTP status, final URL and outbound links. Native image imports bind sourcePage and PNG digest; they prove no live flow',
    'use app/screen galleries for apps and product UI, website galleries for marketing/web direction, and Pinterest as visual discovery; inspect the retained entry and original source when available; screenshots cannot prove live behavior',
    'never pay, start trials, install an MCP, or bypass login to gather references; on restricted access record the gap in scout.md and try another public source. Free viewing is not a reuse license',
    'designReference.boardSha256 is the current storage-byte SHA-256 of .omd/reference-board.json',
    'every visual board piece binds a validated retained design source identity and PNG (path and hash); each candidate needs visual-direction evidence. An extra legacy/domain piece cannot ride alongside a qualified gallery piece.',
    'Each lane may include navigation: [{url, evidence: {path, sha256}, capture: {path, sha256}}] for intermediate native page captures. Retained entries must be reachable from observed search or direct-entry links. Direct v6/v7 chains require new strict navigation-v2 captures, never hidden all-DOM links from retained components or old navigation. The direct root itself is not retained-source coverage. Do not invent edges or relabel image-only evidence as navigation.',
    'when the route carries greenfield-task-flow-benchmark, domainReference.benchmarkSha256 is the canonical taskFlowBenchmarkSha256 of the current v3 benchmark and every benchmark source URL appears in the domain lane. Historical v2 remains readable under its original two-source admission.',
    'when no benchmark applies, benchmarkSha256 is null unless an optional current benchmark was actually published',
    'run omd ref research-check after ref check and benchmark check; any missing, stale, or one-lane evidence blocks downstream work',
  ],
  skeleton: {
    schema: REFERENCE_RESEARCH_SCHEMA,
    sourceContractSha256: '0'.repeat(64),
    marketCoverage: null,
    domainReference: {
      queries: ['<actual similar-service or domain task query>'],
      searches: [{ path: `.omd/discovery/domain/search-${'7'.repeat(64)}.json`, sha256: '7'.repeat(64) }],
      discoveryRoots: [],
      sources: [{
        id: 'domain-service-a',
        url: 'https://example.com/domain-service',
        observedAt: '2026-08-25',
        decision: '<screen, feature, state, vocabulary, or flow decision answered>',
        finding: '<bounded observation from the live service>',
        evidence: { path: '.omd/refs/domain/domain-service-a.png', sha256: '1'.repeat(64) },
        capture: { path: '.omd/refs/domain/domain-service-a.json', sha256: '4'.repeat(64) },
      }, {
        id: 'domain-service-b', url: 'https://example.org/domain-service', observedAt: '2026-08-25',
        decision: '<a second independently answered screen, feature, state, vocabulary, or flow decision>',
        finding: '<bounded observation from the second live service>',
        evidence: { path: '.omd/refs/domain/domain-service-b.png', sha256: '2'.repeat(64) },
        capture: { path: '.omd/refs/domain/domain-service-b.json', sha256: '5'.repeat(64) },
      }, {
        id: 'domain-service-c', url: 'https://example.net/domain-service', observedAt: '2026-08-25',
        decision: '<a third independently answered screen, feature, state, vocabulary, or flow decision>',
        finding: '<bounded observation from the third live service>',
        evidence: { path: '.omd/refs/domain/domain-service-c.png', sha256: '3'.repeat(64) },
        capture: { path: '.omd/refs/domain/domain-service-c.json', sha256: '6'.repeat(64) },
      }],
      benchmarkSha256: null,
    },
    designReference: {
      queries: ['<actual visual-direction or component-craft query>'],
      searches: [{ path: `.omd/discovery/design/search-${'8'.repeat(64)}.json`, sha256: '8'.repeat(64) }],
      discoveryRoots: [],
      sources: [{
        id: 'design-direction-a',
        url: 'https://visual.example.dev/design-reference',
        observedAt: '2026-08-25',
        decision: '<composition, typography, colour, material, component, or motion decision answered>',
        visualRole: 'visual-direction',
        visualAssessment: {
          composition: '<observed macro layout and hierarchy>', typography: '<observed type relationships>',
          density: '<observed spacing and information load>', imagery: '<observed image/material role, or explicit absence>',
          transfer: '<what to adapt to this project and why>', avoid: '<what not to copy and why>',
        },
        finding: '<bounded visual observation>',
        evidence: { path: '.omd/refs/design/design-direction-a.png', sha256: '9'.repeat(64) },
        capture: { path: '.omd/refs/design/design-direction-a.json', sha256: 'a'.repeat(64) },
        discovery: {
          url: 'https://www.pinterest.com/pin/123456789/',
          kind: 'app-gallery', access: 'free',
          qualityReason: '<why this inspected screen fits the task, viewport, hierarchy, type, and density; not just the gallery name>',
          evidence: { path: '.omd/refs/design/gallery-entry.png', sha256: 'b'.repeat(64) },
          capture: { path: '.omd/refs/design/gallery-entry.json', sha256: 'c'.repeat(64) },
        },
      }, {
        id: 'design-direction-b',
        url: 'https://secondvisual.co/design-reference',
        observedAt: '2026-08-25',
        decision: '<a second independently answered composition, typography, material, component, or motion decision>',
        visualRole: 'visual-direction',
        visualAssessment: {
          composition: '<second observed macro layout and hierarchy>', typography: '<second observed type relationship>',
          density: '<second observed spacing and information load>', imagery: '<second observed image/material role, or explicit absence>',
          transfer: '<what to adapt from this distinct source and why>', avoid: '<what not to copy from this distinct source and why>',
        },
        finding: '<bounded visual observation from the second independent source>',
        evidence: { path: '.omd/refs/design/design-direction-b.png', sha256: 'e'.repeat(64) },
        capture: { path: '.omd/refs/design/design-direction-b.json', sha256: 'f'.repeat(64) },
        discovery: {
          url: 'https://dribbble.com/shots/12345678-Task-workspace',
          kind: 'app-gallery', access: 'free',
          qualityReason: '<why this second inspected screen adds a distinct useful comparison>',
          evidence: { path: '.omd/refs/design/gallery-entry-b.png', sha256: '0'.repeat(64) },
          capture: { path: '.omd/refs/design/gallery-entry-b.json', sha256: '1'.repeat(64) },
        },
      }],
      boardSha256: 'd'.repeat(64),
    },
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

const DESIGN_ROUTE_INPUT: InputSkeleton = {
  name: 'design-route-input',
  path: ROUTE_INPUT.path,
  command: ROUTE_INPUT.command,
  keys: [...ROUTE_INPUT_KEYS, 'deliveryMode'],
  constraints: [...(ROUTE_INPUT.constraints ?? []),
    'Design-only ends after independent document/design review. Production, browser-evidence, source-seal, and final-evidence-v2 belong to implementation and are not selected. Finish with omd schema design-handoff and omd completion design-check.',
    'All output stays under .omd/**. Reference-site browsing and authorized disposable design studies are evidence, not application implementation. Do not scaffold React or add dependencies.',
    'Keep the user-selected model and real request facts. Adjust axes, safety rails and selected methods to the actual task; the example is not authority for a low-risk classification.',
  ],
  skeleton: {
    ...ROUTE_INPUT.skeleton as object,
    deliveryMode: 'design-only', projectMode: 'greenfield', allowedPaths: ['.omd/**'],
    referenceDiscovery: { schema: 'reference-discovery-input-v1', taskNeed: 'new-product', uncertainty: 'unresolved', existingEvidence: 'none', intendedUse: '<domain flows and separate visual references>', existingEvidenceUse: null, skipReason: null },
    strategyDecision: {
      schema: 'adaptive-strategy-decision-v1', owner: 'user-selected-model',
      roles: ['omd-framer', 'omd-scout', 'omd-writer', 'omd-typesetter', 'omd-composer', 'omd-sketch', 'omd-eye'],
      stages: ['domain', 'frame', 'scout', 'reference-board', 'copy', 'type-proof', 'composition', 'candidate-generation', 'independent-review'],
      executionWaves: [
        { id: 'frame', mode: 'concurrent', roles: ['omd-framer'] },
        { id: 'research-copy', mode: 'concurrent', roles: ['omd-scout', 'omd-writer'] },
        { id: 'type', mode: 'concurrent', roles: ['omd-typesetter'] },
        { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] },
        { id: 'candidates', mode: 'concurrent', roles: ['omd-sketch'] },
        { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
      ],
      methods: ['design-strategy-balanced-delivery', 'model-capability-probe', 'evidence-claim-accounting', 'hypothesis-validation', 'design-handoff-review', 'reference-discovery', 'parallel-reference-acquisition', 'copy-repair-workflow'],
      aiAssets: [], attributionCategories: ['tokens', 'composition'],
      skips: [
        ...['depth', 'content-grain', 'acquisition', 'moodboard', 'reference-selection', 'art-direction', 'safety-validation', 'reflection-in-action', 'reference-distance', 'image-first-draft', 'evidence-driven-refinement', 'motion-one', 'ai-shipped-asset'].map((id) => ({ id, reason: '<record the task-specific reason; select this stage/method instead when required>' })),
      ],
      rationale: '<why this design strategy reaches the requested handoff without application implementation>',
    },
  },
};

const PRODUCT_ROUTE_INPUT: InputSkeleton = {
  ...ROUTE_INPUT,
  name: 'product-route-input',
  constraints: [...ROUTE_INPUT.constraints!,
    'This is a greenfield product implementation example, not a universal sequence or a design-only handoff. Use new-marketing for a marketing task, not a fictitious product workflow. Keep every real user requirement and choose optional work deliberately.',
    'Replace allowedPaths with the selected stack\'s actual source, asset, manifest, lockfile and build-config paths before publication. namedDependencies preserves libraries explicitly requested by the user (for example react); examples do not authorize an unrelated dependency or stack change.',
  ],
  skeleton: {
    ...ROUTE_INPUT.skeleton as object,
    projectMode: 'greenfield',
    allowedPaths: ['src/**', 'public/**', 'package.json', 'package-lock.json', 'index.html', 'vite.config.*', 'tsconfig*.json'],
    referenceDiscovery: { schema: 'reference-discovery-input-v1', taskNeed: 'new-product', uncertainty: 'unresolved', existingEvidence: 'none', intendedUse: '<domain flows and separate visual references>', existingEvidenceUse: null, skipReason: null },
    strategyDecision: {
      schema: 'adaptive-strategy-decision-v1', owner: 'user-selected-model',
      roles: ['omd-framer', 'omd-scout', 'omd-writer', 'omd-typesetter', 'omd-composer', 'omd-sketch', 'omd-hand', 'omd-eye'],
      stages: ['domain', 'frame', 'scout', 'reference-board', 'copy', 'type-proof', 'composition', 'candidate-generation', 'production', 'browser-evidence', 'independent-review'],
      executionWaves: [
        { id: 'frame', mode: 'concurrent', roles: ['omd-framer'] },
        { id: 'research-copy', mode: 'concurrent', roles: ['omd-scout', 'omd-writer'] },
        { id: 'type', mode: 'concurrent', roles: ['omd-typesetter'] },
        { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] },
        { id: 'candidates', mode: 'concurrent', roles: ['omd-sketch'] },
        { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
        { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
      ],
      methods: ['design-strategy-balanced-delivery', 'model-capability-probe', 'evidence-claim-accounting', 'hypothesis-validation', 'decision-linked-browser-observation', 'reference-discovery', 'parallel-reference-acquisition', 'copy-repair-workflow'],
      aiAssets: [], attributionCategories: ['tokens', 'composition'],
      skips: ['depth', 'content-grain', 'acquisition', 'moodboard', 'reference-selection', 'art-direction', 'safety-validation', 'reflection-in-action', 'reference-distance', 'image-first-draft', 'evidence-driven-refinement', 'motion-one', 'ai-shipped-asset']
        .map(id => ({ id, reason: '<record the task-specific reason; select this stage/method instead when required>' })),
      rationale: '<why this implementation strategy reaches the real outcomes; replace example choices with the task-specific decisions>',
    },
  },
};

const DESIGN_HANDOFF: InputSkeleton = {
  name: 'design-handoff', path: '.omd/design-handoff.json',
  command: 'omd completion design-check --input .omd/design-handoff.json --json',
  keys: ['schema', 'sourceContractSha256', 'artifacts', 'review'],
  constraints: [
    'Bind the current route source SHA and the exact bytes of each nonempty document. Every selected design stage and both reference lanes must have current evidence.',
    'The review document records who reviewed which artifacts, findings, repairs and remaining limits. The checker verifies integrity, not independent authorship, visual quality, or implemented application behavior. Do not call this a final-v2 application approval.',
  ],
  skeleton: {
    schema: 'design-handoff-v1', sourceContractSha256: '0'.repeat(64),
    artifacts: ['screen-map', 'state-model', 'ux-ui-direction', 'content', 'accessibility-trust', 'implementation-handoff', 'open-questions'].map((id) => ({ id, path: `.omd/design/${id}.md`, sha256: '0'.repeat(64) })),
    review: { path: '.omd/design/review.md', sha256: '0'.repeat(64) },
  },
};

export const INPUT_SKELETONS: readonly InputSkeleton[] = [
  DESIGN_JUDGMENT_INPUT,
  CANDIDATE_SELECTION_INPUT,
  {
    name: 'reference-search', path: '.omd/.cache/reference-search.json', command: 'omd ref search --input .omd/.cache/reference-search.json --json',
    keys: ['lane', 'query', 'url', 'queryParam'],
    constraints: ['Choose domain or design explicitly. Replace the example query and URL together; the supported query field must contain that exact query once.',
      'Use Google/Bing/DuckDuckGo, or design-only nativeSearchInputs from ref discover-plan for Pinterest, Dribbble and Siteinspire. Dribbble uses queryParam=path and a lowercase hyphenated query path; Siteinspire uses queryParam=query. No paid API or invented item URLs.',
      'Search and intermediate navigation evidence lives in .omd/discovery/<lane>/, never the retained reference inventory. Failed searches are gaps, not references. Gallery success requires HTTP 200 and observed same-provider item links, not a login wall.',
      'Use ref navigate <url> --lane domain|design for observed intermediate pages. Add its returned object to navigation; it is not a board reference. Capture retained design gallery items/originals separately with ref add.'],
    skeleton: { lane: 'design', query: 'dashboard interface design', url: 'https://www.google.com/search?q=dashboard%20interface%20design', queryParam: 'q' },
  },
  {
    name: 'first-render-surface', path: '.omd/.cache/first-render-surface.json',
    command: 'omd first-render check --page <local-build.html> --input .omd/.cache/first-render-surface.json --json',
    keys: ['heading', 'landmarks', 'repeatedObjects', 'trustSignals', 'visibleText', 'dominantAreaShare'],
    constraints: [
      'Publish the reference-bound design judgment before checking a render. A composition note is not a design judgment.',
      'Replace every example with the actual rendered viewport observations. Arrays may be empty when a feature is absent; do not invent evidence to obtain retain.',
      'dominantAreaShare is the measured dominant-object fraction from 0 to 1. All six keys are required.',
      'This diagnostic projection does not replace browser action evidence, saved captures or independent review.',
      'The CLI captures --page natively and binds the report to the current hypothesis/source/build. Set optional hypothesis.comparisonRequired=true only for an actual comparison task. Advisory findings do not require revise; critical findings do. Changed inputs require a fresh check.',
    ],
    skeleton: { heading: '<visible heading>', landmarks: ['<visible landmark in reading order>'],
      repeatedObjects: [], trustSignals: [], visibleText: ['<visible text>'], dominantAreaShare: 0 },
  },
  {
    name: 'slop-scope', path: '.omd/.cache/slop-scope.json', command: 'omd slop checkpoint --input .omd/.cache/slop-scope.json --json',
    keys: ['schema', 'views'],
    constraints: ['Use actual local HTML production/build entries, not reference URLs or arbitrary localhost ports. Build a bundled SPA before capture.',
      'Cover the final production entry and every final viewport. Keep identical scope while confirmed issues remain; name additional task/state entries where applicable.',
      'For SPA routes/modals/errors add state: {name, startRoute, route, actions, assertions}. Routes are app-relative including query/hash. Actions are {kind:click,selector}, {kind:fill|select,selector,value}; assertions are {selector,state:visible|hidden,text?:expected substring}. Hidden assertions require an existing element. Local state inspection blocks external networking and writes; use bundled local fixtures, not production APIs. Final linked browser states need matching scope route/state/viewport.',
      'Checkpoint runs the source scanner and rendered slop linter, saves native PNGs, and returns an unfilled reviewInput. Inspect its images; never auto-approve the template.',
      'Final state coverage requires the actual viewport pixels to match its authenticated final capture. Replay the same deterministic fixture and settled state; a matching label is insufficient. Default entry views also block external networking and non-read-only requests.',
      'Keyboard preparation uses {kind:press,selector,value:Tab|Shift+Tab|Enter|Space|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End}. Reproduce the native evaluator initial body Tab when it affects focus-visible state; never hide focus styling to match pixels.',
      'After a confirmed issue: owner repair, rebuild, checkpoint again, then resolve the previous issue using the new screenshots. Zero raw warnings is not required; all findings need individual judgments.'],
    skeleton: { schema: 'slop-scope-v1', views: [
      { id: 'entry-desktop', page: 'dist/index.html', viewport: { width: 1280, height: 900 } },
      { id: 'entry-mobile', page: 'dist/index.html', viewport: { width: 390, height: 844 } },
    ] },
  },
  ROUTE_INPUT,
  DESIGN_ROUTE_INPUT,
  PRODUCT_ROUTE_INPUT,
  DESIGN_HANDOFF,
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
  REFERENCE_RESEARCH,
  ART_DIRECTION_CHECK,
  TOKEN_COMMIT,
  RESPONSIVE_TOKEN_COMMIT,
  LOCALE_CONTRACT,
  LOCALE_DESIGN_CONTEXT,
  CULTURAL_DESIGN_PROFILE,
  FUNCTIONAL_REQUIREMENTS,
  FRAME_INPUT,
  DECISION_GRAPH,
  ENTRY_SURFACE_CONTRACT,
  FINAL_RENDER_REVIEWER_PACKET_INPUT,
  TRUSTED_LIFECYCLE_MANIFEST,
  DESIGN_QUALITY_OBSERVATION_PROJECTION_INPUT,
  {
    name: 'reference-flow-input', path: '.omd/.cache/reference-flow-input.json', command: 'omd benchmark record --input .omd/.cache/reference-flow-input.json --json',
    keys: ['schema', 'sourceId', 'flowId', 'url', 'viewport', 'steps'],
    constraints: ['Record one public service in one fresh context. Each step has screenId, state, clicks and assertions; only read-only links/disclosures/tabs are supported. Never enter credentials, submit, purchase, delete or bypass access controls.',
      'Copy returned execution into the benchmark flow, step evidence into each flow step and its capture into the matching screen. Preserve actual url/state and derived action/result labels. Blocked controls become bounded gaps/exclusions. Signed native receipts are project-bound; artifact-only history remains readable but cannot satisfy a selected product benchmark.'],
    skeleton: { schema: 'reference-flow-input-v1', sourceId: 'service-a', flowId: 'inspect-details', url: 'https://example.com/', viewport: { width: 1280, height: 900 }, steps: [
      { screenId: 'entry', state: 'entry', clicks: [], assertions: [{ selector: 'main h1', state: 'visible' }] },
      { screenId: 'details', state: 'details-open', clicks: ['a[data-details]'], assertions: [{ selector: '#details', state: 'visible' }] },
    ] },
  },
  {
    name: 'runtime-design-inventory-input', path: '.omd/.cache/runtime-design-inventory-input.json', command: 'omd init --input .omd/.cache/runtime-design-inventory-input.json --json',
    keys: ['schema', 'views'],
    constraints: ['Build the service locally first. Each view has id/page/viewport, named selectors and optional state with the same shape as slop-scope. Include intended component variants and responsive widths; unvisited states remain gaps.',
      'Each selector identifies one visible element. Computed utility/CSS-in-JS values and inherited custom properties are observed, not approved semantic tokens. Approved tokens and decisions remain untouched. init --check verifies source/build/capture currentness; init --refresh reuses stored scope unless a new --input is supplied.'],
    skeleton: { schema: 'runtime-design-inventory-input-v1', views: [{ id: 'desktop-primary-action', page: 'dist/index.html', viewport: { width: 1280, height: 900 }, selectors: [{ id: 'primary-action', selector: '#primary-action' }] }] },
  },
];

export function inputSkeleton(name: string): InputSkeleton {
  const found = INPUT_SKELETONS.find((entry) => entry.name === name);
  if (found === undefined) {
    const protocol = ({ 'copy-deck': 'protocol/copy-deck.md', 'type-proof': 'theory/typography.md', composition: 'protocol/composition-contract.md' } as Record<string, string>)[name];
    if (protocol) throw new Error(`${name} is an authored Markdown document, not JSON. Run omd pack ${protocol} and omd brief ${name === 'copy-deck' ? 'copy' : name} --json for its format, owner, and checks.`);
    throw new Error(`unknown schema ${name}; known: ${INPUT_SKELETONS.map((entry) => entry.name).join(', ')}`);
  }
  return found;
}
