import { closestNames } from './suggestions.ts';
import { ADAPTIVE_ROUTE_INPUT_KEYS, ADAPTIVE_ROUTE_INPUT_SCHEMA } from '../route/adaptive-flow-domain.ts';
import {
  REFERENCE_RESEARCH_KEYS,
  REFERENCE_RESEARCH_SCHEMA,
} from '../ref/reference-research.ts';
import { CAPTURE_PREPARATION_SCHEMA } from '../ref/capture-preparation.ts';
import {
  LOCALE_CONTRACT_KEYS,
  LOCALE_CONTRACT_SCHEMA,
  LOCALE_MODES,
} from '../locale/contract.ts';
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
import { TRUSTED_LIFECYCLE_MANIFEST_SCHEMA } from '../runtime/trusted-evaluation-contract.ts';

export type InputSkeleton = Readonly<{
  name: string;
  path: string;
  command: string;
  keys: readonly string[];
  constraints?: readonly string[];
  skeleton: unknown;
}>;

const routeSkeleton = (projectMode: 'greenfield' | 'existing', allowedPaths: readonly string[]): unknown => ({
  schema: ADAPTIVE_ROUTE_INPUT_SCHEMA,
  request: '<Pi binds the exact authenticated request; outside Pi provide the full verbatim request>',
  projectMode,
  namedDependencies: [],
  allowedPaths,
  taskOutcome: {
    schema: 'task-outcome-contract-v1',
    goal: '<required result>',
    mustHave: ['<required browser-observable outcome>'],
    mustNotHave: ['<prohibited outcome>'],
    completionEvidence: ['<observable evidence>'],
    strategyFreedom: ['<model-owned implementation freedom>'],
  },
  uxPolicy: {
    schema: 'ux-policy-v1',
    decisions: [{ id: 'task-complete', kind: 'required_outcome', status: 'required' }],
  },
  evidenceClaims: {
    schema: 'evidence-claim-publication-v1',
    claims: [{
      id: 'user-request',
      text: '<confirmed user fact>',
      status: 'confirmed',
      userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'message-1', excerpt: '<user excerpt>' }],
    }],
    userFacts: ['user-request'],
    workingContext: [],
  },
  referenceDiscovery: {
    schema: 'reference-discovery-input-v1',
    taskNeed: projectMode === 'greenfield' ? 'new-product' : 'copy-only-edit',
    uncertainty: 'unresolved',
    existingEvidence: 'none',
    intendedUse: '<how references will inform the result>',
    existingEvidenceUse: null,
    skipReason: null,
  },
  designAxes: {
    schema: 'design-axis-input-v1',
    taskSize: 'medium',
    failureRisk: 'low',
    uxNeed: 'focused',
    expressiveDesignNeed: 'balanced',
  },
  modelCapability: {
    now: 0,
    routingInput: {
      schema: 'model-capability-probe-routing-input-v1',
      selectedModel: {
        selection: 'host-selection',
        provider: 'host-provider',
        modelId: 'host-model',
        revision: 'current',
      },
      profile: null,
    },
  },
  browserDecisionContext: {
    schema: 'adaptive-browser-decision-context-v1',
    status: 'pending',
    decisionIds: [],
    reason: '<fresh linked observation is pending>',
  },
  validatedLearningContext: {
    schema: 'adaptive-learning-context-v1',
    status: 'none',
    learningIds: [],
    reason: '<no validated scoped learning applies>',
  },
});

const route = (name: 'route-input' | 'product-route-input', projectMode: 'existing' | 'greenfield'): InputSkeleton => ({
  name,
  path: `.omd/.cache/${name}.json`,
  command: `omd route validate --input .omd/.cache/${name}.json --json`,
  keys: ADAPTIVE_ROUTE_INPUT_KEYS,
  constraints: [
    'The host owns process policy, review purpose, and the canonical production/browser-evidence/independent-review strategy. Do not add workflow roles, stages, methods, skips, delivery mode, or approval fields.',
    'Preserve the exact request, outcome, permission, scope, locale, reference-discovery, and evidence-claim facts.',
    'Reference research may be selected and executed directly without adding a structured Scout or candidate stage.',
  ],
  skeleton: routeSkeleton(projectMode, projectMode === 'greenfield'
    ? ['src/**', 'public/**', 'dist/**', 'package.json', 'package-lock.json', 'index.html', 'vite.config.*', 'tsconfig*.json']
    : ['src/**']),
});

const language = (kind: 'intake' | 'feedback'): InputSkeleton => ({
  name: kind === 'intake' ? 'design-language-input' : 'design-feedback-input',
  path: `.omd/.cache/design-language-${kind}.json`,
  command: `omd ${kind === 'intake' ? 'language' : 'feedback'} translate --input .omd/.cache/design-language-${kind}.json --json`,
  keys: ['schema', 'kind', 'text', 'request', 'sourceContractSha256', 'readings', 'chosenId', 'decision'],
  skeleton: {
    schema: 'design-language-input-v1',
    kind,
    text: '<exact user phrase>',
    request: '<complete original route request>',
    sourceContractSha256: '0'.repeat(64),
    readings: [{
      id: 'spacing',
      labelKo: '묶음 간격 늘리기',
      origin: { kind: 'model-proposed' },
      targets: [{
        id: 'form-gap', metric: 'group-gap', role: 'form', route: '/', selector: 'form',
        viewport: 'desktop', state: 'initial', range: [16, 24], unit: 'px',
        direction: 'increase', minDelta: 4,
      }],
      referenceKeywordsEn: ['grouped settings rows'],
      counterSignals: ['rows touching'],
      mustNotMean: ['delete required fields'],
    }],
    chosenId: 'spacing',
    decision: '<observed task-specific reason>',
  },
});

export const INPUT_SKELETONS: readonly InputSkeleton[] = Object.freeze([
  route('route-input', 'existing'),
  route('product-route-input', 'greenfield'),
  {
    name: 'trusted-lifecycle-manifest',
    path: '.omd/.cache/trusted-lifecycle-manifest.json',
    command: 'omd lifecycle finish --manifest .omd/.cache/trusted-lifecycle-manifest.json --json',
    keys: ['schema', 'entryPath', 'scripts'],
    skeleton: {
      schema: TRUSTED_LIFECYCLE_MANIFEST_SCHEMA,
      entryPath: 'dist/index.html',
      scripts: [{
        outcomeRef: '<required outcome id>',
        actions: [],
        assertions: [{ kind: 'visible-text', selector: 'main', text: '<expected visible text>' }],
      }],
    },
  },
  {
    name: 'reference-research',
    path: '.omd/.cache/reference-research.json',
    command: 'omd ref research-set --input .omd/.cache/reference-research.json --json',
    keys: REFERENCE_RESEARCH_KEYS,
    skeleton: {
      schema: REFERENCE_RESEARCH_SCHEMA,
      sourceContractSha256: '0'.repeat(64),
      domainReference: { sources: [] },
      designReference: { sources: [] },
    },
  },
  {
    name: 'reference-search-leads',
    path: '.omd/.cache/reference-search-leads.json',
    command: 'omd ref leads add --input .omd/.cache/reference-search-leads.json --json',
    keys: ['schema', 'lane', 'query', 'urls', 'provider', 'tool', 'observedAt'],
    skeleton: {
      schema: 'reference-search-leads-v1',
      lane: 'domain',
      query: '<actual query>',
      urls: [],
      provider: '<host provider>',
      tool: 'web_search',
      observedAt: '<ISO timestamp>',
    },
  },
  {
    name: 'reference-search',
    path: '.omd/.cache/reference-search.json',
    command: 'omd ref search --input .omd/.cache/reference-search.json --json',
    keys: ['lane', 'query', 'url', 'queryParam'],
    skeleton: {
      lane: 'design',
      query: 'dashboard interface design',
      url: 'https://www.google.com/search?q=dashboard%20interface%20design',
      queryParam: 'q',
    },
  },
  {
    name: 'reference-discovery-batch',
    path: '.omd/.cache/reference-discovery-batch.json',
    command: 'omd ref discover-batch --input .omd/.cache/reference-discovery-batch.json --json',
    keys: ['kind', 'source', 'lane'],
    skeleton: [{ kind: 'navigate', source: 'https://www.example.com/', lane: 'domain' }],
  },
  {
    name: 'reference-capture-preparation',
    path: '.omd/.cache/reference-capture-preparation.json',
    command: 'omd ref add <url> --preparation .omd/.cache/reference-capture-preparation.json',
    keys: ['schema', 'actions', 'assertions'],
    skeleton: {
      schema: CAPTURE_PREPARATION_SCHEMA,
      actions: [{ kind: 'click', selector: 'button[type="button"][aria-controls][aria-expanded]' }],
      assertions: [{ selector: '#content', state: 'visible' }],
    },
  },
  language('intake'),
  language('feedback'),
  {
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
  },
  {
    name: 'locale-design-context',
    path: '.omd/locale-design-context.json',
    command: 'omd locale plan --json',
    keys: LOCALE_DESIGN_CONTEXT_KEYS,
    skeleton: {
      schema: LOCALE_DESIGN_CONTEXT_SCHEMA,
      conversationLanguage: null,
      surfaceLocale: 'en-US',
      marketRegion: null,
      audience: null,
      task: '<task>',
      domain: '<domain>',
      surface: LOCALE_DESIGN_SURFACES[0],
      desiredFit: LOCALE_DESIGN_FITS[0],
      brandInvariants: [],
      marketAuthorityClaimId: null,
    },
  },
  {
    name: 'cultural-design-profile',
    path: '.omd/.cache/cultural-design-profile.json',
    command: 'omd locale profile --input .omd/.cache/cultural-design-profile.json --json',
    keys: CULTURAL_DESIGN_PROFILE_KEYS,
    skeleton: {
      schema: CULTURAL_DESIGN_PROFILE_SCHEMA,
      contextSha256: '0'.repeat(64),
      capturedAt: '<ISO timestamp>',
      sources: [],
      brandInvariants: [],
      authorizedMarketFacts: [],
      typeProofSha256: '0'.repeat(64),
      decisions: CULTURAL_DESIGN_AXES.map((axis, index) => ({
        id: `decision-${index + 1}`,
        axis,
        status: 'unknown',
        sourceIds: [],
        counterexampleIds: [],
        mechanism: null,
        adaptation: null,
        avoid: '<unsupported assumption to avoid>',
        falsifier: '<observable counterexample>',
      })),
      rejectedCliches: [],
      confidence: 'bounded',
    },
  },
]);

export function modelLedRouteInput(input: InputSkeleton): InputSkeleton {
  if (input.name !== 'route-input' && input.name !== 'product-route-input') {
    throw new Error('model-led route starter must be route-input or product-route-input');
  }
  const value = structuredClone(input.skeleton) as Record<string, unknown>;
  for (const key of ['processPolicy', 'reviewPurpose', 'reviewPurposeAuthority', 'deliveryMode', 'strategyDecision']) {
    delete value[key];
  }
  return Object.freeze({ ...input, keys: ADAPTIVE_ROUTE_INPUT_KEYS, skeleton: value });
}

export function inputSkeleton(name: string): InputSkeleton {
  const found = INPUT_SKELETONS.find(entry => entry.name === name);
  if (found !== undefined) return found;
  const suggestions = closestNames(name, INPUT_SKELETONS.map(entry => entry.name));
  throw new Error(`unknown schema ${name}${suggestions.length ? `; did you mean: ${suggestions.join(', ')}?` : '; run omd schema list'}`);
}
