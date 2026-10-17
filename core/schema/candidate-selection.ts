import { CANDIDATE_SELECTION_POINTER_SCHEMA } from '../brief/candidate-selection.ts';
import type { InputSkeleton } from './inputs.ts';
import { ACCESSIBILITY_CONCERNS } from '../frame/process-plan.ts';
import { INTERACTIVE_PROCESS_POLICY } from '../route/process-policy.ts';

export const CANDIDATE_SELECTION_REQUIRED_KEYS = Object.freeze([
  'schema',
  'directory',
  'indexSha256',
  'selectionSha256',
] as const);
export const CANDIDATE_SELECTION_OPTIONAL_KEYS = Object.freeze(['captureStates'] as const);
export const CANDIDATE_SELECTION_ALLOWED_KEYS = Object.freeze([
  ...CANDIDATE_SELECTION_REQUIRED_KEYS,
  ...CANDIDATE_SELECTION_OPTIONAL_KEYS,
] as const);

export const CANDIDATE_SELECTION_INPUT: InputSkeleton = {
  name: 'candidate-selection', path: '.omd/.cache/candidate-selection-input.json',
  command: 'omd candidate select --input .omd/.cache/candidate-selection-input.json --json',
  keys: CANDIDATE_SELECTION_ALLOWED_KEYS,
  constraints: [
    'Sketch owns only its assigned .omd/.cache/sketches/<id>/ directory. The coordinator evaluates candidates and publishes the selected current pointer through candidate select.',
    'The selected directory must contain nonempty index.html, noun-swap-test.json, selection.json and ux-models.json; directory is one basename, never a path.',
    'After real candidate generation/rendered selection, obtain both exact current file hashes with omd hash. Never guess hashes, fabricate candidates or copy a selection verdict onto changed source.',
    'The publisher captures the selected first-party candidate at fixed 1280x900 and 390x844 viewports and writes a v2 pointer binding its complete served tree and both PNGs. Hand receives those current images by default; raw third-party reference images remain private. Bundle candidate assets locally.',
    'Every newly captured candidate also preserves its exact served source tree in content-addressed candidate-source-history storage and records the present composition, frame, copy and type input digests. This is recoverable history, not approval or automatic restoration. Historical input digests stay unchanged when production later rebinds its own proofs; they never establish current composition authority. Changed candidate source requires a fresh capture, and inputs may not change during that capture.',
    'Optional captureStates declares 1-12 complementary local states with unique names other than initial. Each state has exactly name, startRoute, route, actions and assertions. Routes are canonical local paths; actions use bounded click/fill/select/press selectors; assertions require visible/hidden selectors and optional text. The publisher executes each plan in fresh contexts at both fixed viewports, binds plans and whole PNGs to the same served tree, and refuses failed assertions or external networking. Never supply screenshots or unobserved state labels.',
    'The mandatory initial desktop/mobile pair remains the early representative target. Complementary pairs let the critic choose exactly one matching candidate state per selected source slot/viewport; all approved first-party images reach production through resolved candidate evidence.',
  ],
  skeleton: { schema: CANDIDATE_SELECTION_POINTER_SCHEMA, directory: '<selected-candidate-id>',
    indexSha256: '<omd hash .omd/.cache/sketches/<id>/index.html>',
    selectionSha256: '<omd hash .omd/.cache/sketches/<id>/selection.json>' },
};

const receipt = (path: string) => ({ path, sha256: '<exact SHA-256 from omd hash>' });
const seed = { schema: 'token-commit-v3', scope: { representativeSurfaceId: 'main' },
  primitives: { ink: { type: 'color', value: '#111111' }, paper: { type: 'color', value: '#ffffff' }, family: { type: 'font-family', value: ['system-ui'] }, bodySize: { type: 'number', value: 16, unit: 'px' }, leading: { type: 'number', value: 1.5, unit: 'unitless' } },
  semantic: { text: { ref: 'ink' }, canvas: { ref: 'paper' } },
  textStyles: { body: { familyRef: 'family', sizeRef: 'bodySize', weight: 400, lineHeightRef: 'leading', letterSpacingRef: null } } };
const plan = { schema: 'candidate-plan-v2', owner: 'omd-art-director', sourceContractSha256: '<current route sourceContractSha256>',
  representative: { surfaceId: 'main', stateId: 'initial', selectionReason: '<why this one surface resolves the direction uncertainty; full Frame scope remains>' },
  content: { receipt: receipt('.omd/.cache/candidate-content-input.json'), projectionSha256: '<candidateContentProjection digest>', contentIds: ['body'], status: 'supplied' },
  tokens: receipt('.omd/tokens.json'), referenceApplication: null, referenceAnalysis: null, existingSystem: null,
  views: [{ id: 'desktop-1280x900@1', width: 1280, height: 900 }, { id: 'mobile-390x844@1', width: 390, height: 844 }], candidateCount: 2, countReason: '<the actual structural/density/type uncertainty>',
  candidates: ['A', 'B'].map(id => ({ id, layoutStrategy: `<${id}: distinct macro composition>`, relationship: `<${id}: content-to-form relationship>`, densityStrategy: '<real density hypothesis>', typographyStrategy: '<provisional type treatment>', tone: '<tone>', rationale: '<evidence>', tradeoffs: ['<tradeoff>'], primitiveOverrides: {}, reuse: [], departures: [], falsifier: '<observable rejection condition>' })) };
const preview = { renderId: '<native measurement packet sha256>:<viewId>', sourceSha256: '<exact candidate index.html SHA-256>', surfaceId: 'main', stateId: 'initial', viewId: 'desktop-1280x900@1', viewport: { width: 1280, height: 900 }, png: receipt('.omd/visual-measurement-captures/sha256-<hash>.png'), capture: receipt('.omd/visual-measurements/sha256-<hash>.json') };
function skeleton(name: string, value: object, command: string, constraints: string[]): InputSkeleton {
  return { name, path: name === 'minimal-tokens' ? '.omd/tokens.json' : `.omd/.cache/${name}-input.json`, keys: Object.keys(value), command, constraints, skeleton: value };
}
export const PROCESS_INPUTS: readonly InputSkeleton[] = [
  skeleton('minimal-tokens', seed, 'omd tokens check --input .omd/tokens.json --json', ['Art Director commits only the roles this representative content needs. V3 has no rung, display, accent, or elevation quota. Font stacks declare a generic fallback; actual loading/glyph coverage still needs rendering.']),
  skeleton('token-extensions', { schema: 'token-extensions-v1', primitives: {}, semantic: {}, textStyles: {}, neededBy: [] }, 'omd tokens extend --input .omd/.cache/token-extensions-input.json --json', ['After current selection only. All keys are disjoint from the selected base and prior additions. neededBy contains {tokenId:"primitives.errorInk",surfaceId,stateId,componentId} for every added token; the component/state must exist in Frame. A representative role remap stales direction.']),
  skeleton('candidate-content', { schema: 'candidate-content-v1', surfaceId: 'main', stateId: 'initial', copy: receipt('.omd/copy-deck.md'), units: [{ id: 'body', text: '<exact visible copy/data unit>', roleId: 'body' }], facts: ['<supplied fact>'], truthBoundary: '<real/demo boundary>' }, 'omd candidate content --input .omd/.cache/candidate-content-input.json --json', [
    'Use the same complete visible unit/item set for the named surface/state in every candidate. Closed-control option domains remain shared facts/data; only the painted current value belongs in initial units. An open control needs its own explicit representative state. Never expose every choice just to satisfy measurement or remove frozen difficult units. The command validates and returns the projection digest; it does not author or approve copy. Writer art metadata closure does not change the visible-copy projection.',
    'Before freezing units, judge the represented task information: readable work-object identity, current state, ownership where relevant and action labels, using real or authorized demo values. Missing meaningful values return to the content/plan owner; do not invent facts, substitute unexplained glyphs or delete useful metadata to repair layout. Exact-content validation preserves declared units; it does not certify their semantic completeness.',
  ]),
  skeleton('candidate-plan', plan, 'omd candidate plan --input .omd/.cache/candidate-plan-input.json --json', ['Publish before creating candidate source directories. Copy and minimal tokens precede candidates; full Typesetter/Composer proof follows choice. Views exactly match the representative Frame scope. Every nested object is closed. Overrides use the same typed primitive union and preserve key type/unit.']),
  skeleton('candidate-set', { schema: 'candidate-set-v2', plan: receipt('.omd/.cache/sketches/plans/sha256-<hash>.json'), candidates: ['A', 'B'].map(id => ({ id, source: receipt(`.omd/.cache/sketches/${id}/index.html`), assets: [], previews: [preview], effectiveTokensSha256: '<digest of seed + this candidate primitiveOverrides>', limitations: [] })) }, 'omd candidate check --input .omd/.cache/candidate-set-input.json --json', ['Include every plan view for each of 2-3 candidates. Render with omd measure --entry .omd/.cache/sketches/<id>/index.html --scope <scope.json>; native measurement receipts authenticate PNG/source/state/viewport. All visible copy and data units are equal. candidate packet --input commits the valid set and derives presentation plus blind packet. It is a guarded publisher; check is read-only.']),
  skeleton('candidate-selection-v2', { schema: 'candidate-selection-input-v2', candidateSet: receipt('.omd/.cache/sketches/sets/sha256-<hash>.json'), selectedId: '<actual chosen ID>', inputDigest: '<candidate packet pending.inputDigest>', decision: { decidedBy: 'user', userMessage: '<verbatim actual answer>', userInputReceipt: receipt('.omd/.cache/sketches/authority/sha256-<hash>.json'), displayedSet: receipt('.omd/.cache/sketches/presentations/sha256-<hash>.json') } }, 'omd candidate select --input .omd/.cache/candidate-selection-v2-input.json --json', ['Pi binds actual interactive/RPC bytes and signed userInputObservation automatically. Do not invent receipt bytes. Bare continue is not a choice. Other hosts must supply a verified host observation and disclose missing capability.', 'Explicitly autonomous routes instead use decision:{decidedBy:"agent",autonomyGrant:{path,sha256},eyeReview:{path,sha256},reviewIndependence:"isolated"}. A signed grant and actual isolated Eye output are mandatory; checkpoint:none is not authority.']),
];

/** New starters opt into the versioned process. Existing route records remain replayed as-is. */
export function currentProcessRouteInput(input: InputSkeleton): InputSkeleton {
  const value = input.skeleton as { strategyDecision: { roles: string[]; stages: string[]; methods: string[]; skips: { id: string; reason: string }[]; executionWaves: { id: string; mode: string; roles: string[] }[] } };
  const s = value.strategyDecision, concepts = s.stages.includes('candidate-generation');
  const roles = concepts ? [...s.roles, 'omd-art-director'] : s.roles;
  const stages = concepts ? s.stages.filter(id => id !== 'candidate-generation') : [...s.stages];
  if (concepts) stages.splice(stages.indexOf('type-proof'), 0, 'candidate-generation');
  const waves = concepts ? s.executionWaves.filter(w => w.id !== 'candidates') : [...s.executionWaves];
  if (concepts) waves.splice(waves.findIndex(w => w.id === 'type'), 0, { id: 'concepts', mode: 'concurrent', roles: ['omd-art-director', 'omd-sketch'] });
  return { ...input, keys: [...input.keys, 'processPolicy'], constraints: [...input.constraints ?? [], 'processPolicy defaults to interactive direction. concept-exploration and candidate-generation select one another. The Art Director/Sketch team commits a plan before individual source calls; never infer autonomous permission.'],
    skeleton: { ...value, processPolicy: INTERACTIVE_PROCESS_POLICY, strategyDecision: { ...s, roles, stages, executionWaves: waves,
      methods: concepts ? [...s.methods, 'concept-exploration'] : s.methods,
      skips: concepts ? s.skips : [...s.skips, { id: 'concept-exploration', reason: '<unchanged current direction, supplied authoritative target, bounded nonvisual change, or explicit user decline>' }] } } };
}
export function modelLedRouteInput(input: InputSkeleton): InputSkeleton {
  const value = structuredClone(input.skeleton) as Record<string, unknown>;
  delete value.processPolicy;
  return {
    ...input,
    keys: input.keys.filter(key => key !== 'processPolicy'),
    constraints: [
      'The authenticated host supplies model-led execution policy. Preserve the complete original request, required outcomes, permission boundaries and real unknowns.',
      'taskOutcome.mustHave, mustNotHave and completionEvidence describe browser-observable product/surface outcomes. Preserve execution-only requirements verbatim in taskOutcome.executionRequirements with requirement and enforcedBy; do not ask page text to prove authorship, independent review or future finalization. Partition before publication, never reclassify a failed product behavior to make a run pass.',
      'The default is direct production, real browser verification and one independent final review. Choose research, references, candidate exploration and delegation when they help; they are not mandatory intermediate documents.',
      'Hand names the production responsibility; the current model can author source directly through ordinary scoped tools. Use maker run only when delegation is useful.',
      'Optional methods that are deliberately selected retain their real publisher and evidence contracts. Do not claim a method, source, approval or visual fidelity that was not actually established.',
      'Allowed paths describe the real project scope, including build output. Browser checks must cover every requested outcome; no design-choice interview is required.',
      'designAxes uses schema=design-axis-input-v1, taskSize=small|medium|large, failureRisk=low|moderate|high, uxNeed=baseline|focused|rigorous, expressiveDesignNeed=restrained|balanced|showpiece.',
      'failureRisk=high requires uxNeed=rigorous. Preserve the assessed risk instead of lowering it to repair this contradiction; high risk also requires an enforced hard_safety_rail in uxPolicy.',
    ],
    skeleton: {
      ...value,
      strategyDecision: {
        schema: 'adaptive-strategy-decision-v1', owner: 'user-selected-model',
        roles: ['omd-hand', 'omd-eye'],
        stages: ['production', 'browser-evidence', 'independent-review'],
        executionWaves: [
          { id: 'build', mode: 'concurrent', roles: ['omd-hand'] },
          { id: 'verify', mode: 'concurrent', roles: ['omd-eye'] },
        ],
        methods: [], aiAssets: [], attributionCategories: [], skips: [],
        rationale: '<the model chooses the methods needed for this requested result; explain only material decisions>',
      },
    },
  };
}

export function currentFrameInput(input: InputSkeleton): InputSkeleton {
  return { ...input, keys: [...input.keys, 'surfacePlan', 'validationPlan', 'accessibilityPlan'], skeleton: { ...input.skeleton as object, schema: 'frame-input-v2',
    surfacePlan: { schema: 'surface-plan-v1', representativeSurfaceId: 'main', views: plan.views, surfaces: [{ id: 'main', purpose: '<requested surface purpose>', taskIds: ['T1'], componentIds: ['main-content'], states: [{ id: 'initial', required: true, reason: '<actual entry state>', primaryActionId: null, primaryRequired: false }], viewIds: plan.views.map(v => v.id), referenceCoverage: 'brief-derived', referenceIds: [], referenceGap: '<gap>', referenceDecision: '<brief-derived decision>', contentCases: [] }] },
    validationPlan: { schema: 'validation-plan-v1', items: [] },
    accessibilityPlan: { schema: 'accessibility-plan-v1', items: ACCESSIBILITY_CONCERNS.map(concern => ({ id: concern, concern, applicability: 'unknown', surfaceIds: ['main'], taskIds: ['T1'], stateIds: ['initial'], viewIds: plan.views.map(v => v.id), rationale: '<assess against actual task obligations>', requiredEvidence: ['<applicable evidence>'], method: '<real method; unavailable is unverified, not N/A>' })) },
  }, constraints: [...input.constraints ?? [], 'V2 preserves all requested surfaces. The representative is only a decision sample. surfacePlan.views defines exact dimensions; each surface declares its own states/views and real contentCases. Planned participants are not observed research; observed validation requires evidence. Unknown accessibility is not pass.'] };
}
