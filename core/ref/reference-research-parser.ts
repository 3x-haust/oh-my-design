import { isAbsolute } from 'node:path';
import {
  designDiscoveryItemIdentity,
  designDiscoveryProvider,
  referenceServiceFamily,
  referenceServiceHost,
} from './design-discovery-sources.ts';
import { parseMarketReferenceCoverage } from './market-reference-coverage.ts';
import {
  REFERENCE_RESEARCH_DESIGN_KEYS, REFERENCE_RESEARCH_DOMAIN_KEYS, REFERENCE_RESEARCH_EVIDENCE_KEYS,
  REFERENCE_RESEARCH_KEYS, REFERENCE_RESEARCH_SCHEMA, REFERENCE_RESEARCH_SOURCE_KEYS,
  type ReferenceResearch, type ResearchDiscoveryRoot, type ResearchEvidence, type ResearchLane, type ResearchSource,
} from './reference-research-types.ts';

const REFERENCE_RESEARCH_LEGACY_KEYS = REFERENCE_RESEARCH_KEYS.filter(key => key !== 'marketCoverage');
const SHA256 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function fail(code: string): never { throw new Error(code); }

export function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function boundedText(value: unknown, code: string): string {
  const result = text(value, code);
  if (result.length > 4096 || Array.from(result).some(character => {
    const point = character.codePointAt(0) ?? 0;
    return point >= 0xd800 && point <= 0xdfff;
  })) fail(code);
  return result;
}

function digest(value: unknown, code: string): string {
  const parsed = text(value, code);
  if (!SHA256.test(parsed)) fail(code);
  return parsed;
}

function texts(value: unknown, code: string, direct = false): readonly string[] {
  if (!Array.isArray(value) || (!direct && value.length === 0) || Object.keys(value).length !== value.length) fail(code);
  const parsed = value.map((entry) => text(entry, code));
  if (new Set(parsed).size !== parsed.length) fail(`${code}_DUPLICATE`);
  return parsed;
}

export function httpsUrl(value: unknown): string {
  const parsed = text(value, 'REFERENCE_RESEARCH_SOURCE_URL');
  try { if (new URL(parsed).protocol !== 'https:') fail('REFERENCE_RESEARCH_SOURCE_URL'); }
  catch { fail('REFERENCE_RESEARCH_SOURCE_URL'); }
  return parsed;
}

function evidence(value: unknown, diagnostic = false, fieldPath?: string): ResearchEvidence {
  const input = record(value, 'REFERENCE_RESEARCH_EVIDENCE_INVALID');
  exactKeys(input, REFERENCE_RESEARCH_EVIDENCE_KEYS, 'REFERENCE_RESEARCH_EVIDENCE_KEYS');
  const pathError = fieldPath === undefined ? 'REFERENCE_RESEARCH_EVIDENCE_PATH'
    : `REFERENCE_RESEARCH_EVIDENCE_PATH: ${fieldPath}.path must be a project-relative retained reference path under .omd/refs/; use native ref add or ref import-image receipts and keep navigation captures in the lane's navigation array`;
  const path = text(input.path, pathError);
  if (isAbsolute(path) || path.includes('\\') || path.split('/').includes('..')
    || !(path.startsWith('.omd/refs/') || (diagnostic && path.startsWith('.omd/discovery/')))) fail(pathError);
  return Object.freeze({ path, sha256: digest(input.sha256, 'REFERENCE_RESEARCH_EVIDENCE_SHA') });
}

function source(value: unknown, design: boolean, index: number): ResearchSource {
  const fieldPath = `${design ? 'designReference' : 'domainReference'}.sources[${index}]`;
  const input = record(value, 'REFERENCE_RESEARCH_SOURCE_INVALID');
  exactKeys(input, design ? [...REFERENCE_RESEARCH_SOURCE_KEYS, 'discovery', 'visualRole', 'visualAssessment'] : REFERENCE_RESEARCH_SOURCE_KEYS, 'REFERENCE_RESEARCH_SOURCE_KEYS');
  const observedAt = text(input.observedAt, 'REFERENCE_RESEARCH_OBSERVED_AT');
  if (!DATE.test(observedAt)) fail('REFERENCE_RESEARCH_OBSERVED_AT');
  let discovery: ResearchSource['discovery'];
  let visualAssessment: ResearchSource['visualAssessment'];
  if (design) {
    if (!['visual-direction', 'component-support'].includes(input.visualRole as string)) fail('REFERENCE_RESEARCH_VISUAL_ROLE');
    const assessment = record(input.visualAssessment, 'REFERENCE_RESEARCH_VISUAL_ASSESSMENT');
    const axes = ['composition', 'typography', 'density', 'imagery', 'transfer', 'avoid'] as const;
    exactKeys(assessment, axes, 'REFERENCE_RESEARCH_VISUAL_ASSESSMENT_KEYS');
    visualAssessment = Object.freeze(Object.fromEntries(axes.map(axis => [axis, text(assessment[axis], `REFERENCE_RESEARCH_VISUAL_${axis.toUpperCase()}`)]))) as ResearchSource['visualAssessment'];
    const entry = record(input.discovery, 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_REQUIRED');
    exactKeys(entry, ['url', 'kind', 'access', 'qualityReason', 'evidence', 'capture'], 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_KEYS');
    if (!['app-gallery', 'web-gallery', 'visual-bookmark', 'user-provided'].includes(entry.kind as string)) fail('REFERENCE_RESEARCH_DESIGN_DISCOVERY_KIND');
    if (entry.access !== 'free') fail('REFERENCE_RESEARCH_DESIGN_FREE_ACCESS_REQUIRED');
    const entryUrl = httpsUrl(entry.url);
    const entryPath = new URL(entryUrl).pathname.replace(/\/+$/, '') || '/';
    if (entry.kind !== 'user-provided' && ['/', '/landing', '/home', '/explore', '/search', '/search/pins'].includes(entryPath)) {
      fail('REFERENCE_RESEARCH_DISCOVERY_ENTRY_REQUIRED: capture the inspected gallery item, not its homepage');
    }
    if (entry.kind !== 'user-provided' && designDiscoveryProvider(entryUrl) === null) {
      fail('REFERENCE_RESEARCH_DISCOVERY_PROVIDER: use an inspected Pinterest/Dribbble/Behance/Siteinspire/Land-book/Godly/UI Bowl item; a service or documentation page is not a gallery');
    }
    discovery = Object.freeze({
      url: entryUrl, kind: entry.kind as NonNullable<ResearchSource['discovery']>['kind'],
      access: 'free', qualityReason: text(entry.qualityReason, 'REFERENCE_RESEARCH_DESIGN_QUALITY_REASON'),
      evidence: evidence(entry.evidence, false, `${fieldPath}.discovery.evidence`),
      capture: evidence(entry.capture, false, `${fieldPath}.discovery.capture`),
    });
  }
  return Object.freeze({
    id: text(input.id, 'REFERENCE_RESEARCH_SOURCE_ID'), url: httpsUrl(input.url), observedAt,
    decision: text(input.decision, 'REFERENCE_RESEARCH_DECISION'), finding: text(input.finding, 'REFERENCE_RESEARCH_FINDING'),
    evidence: evidence(input.evidence, false, `${fieldPath}.evidence`),
    capture: evidence(input.capture, false, `${fieldPath}.capture`),
    ...(discovery ? { discovery } : {}),
    ...(design ? {
      visualRole: input.visualRole as NonNullable<ResearchSource['visualRole']>,
      visualAssessment: requiredVisualAssessment(visualAssessment),
    } : {}),
  });
}

function requiredDiscovery(entry: ResearchSource): NonNullable<ResearchSource['discovery']> {
  if (entry.discovery === undefined) fail('REFERENCE_RESEARCH_DESIGN_DISCOVERY_REQUIRED');
  return entry.discovery;
}

function requiredVisualAssessment(value: ResearchSource['visualAssessment']): NonNullable<ResearchSource['visualAssessment']> {
  if (value === undefined) fail('REFERENCE_RESEARCH_VISUAL_ASSESSMENT');
  return value;
}

function discoveryItemIdentity(entry: ResearchSource): string {
  const discovery = requiredDiscovery(entry);
  const supported = designDiscoveryItemIdentity(discovery.url);
  if (supported !== null) return supported;
  const url = new URL(discovery.url);
  url.search = '';
  url.hash = '';
  return url.href;
}

function discoveryRoots(value: unknown, design: boolean): readonly ResearchDiscoveryRoot[] {
  const code = 'REFERENCE_RESEARCH_DISCOVERY_ROOT';
  if (!Array.isArray(value) || value.length > 100 || Object.keys(value).length !== value.length) fail(code);
  const lane = design ? 'design' : 'domain';
  const roots = value.map(value => {
    const input = record(value, code);
    exactKeys(input, ['method', 'entry', 'url', 'reason', 'evidence', 'capture'], `${code}_KEYS`);
    const entry = design ? 'free-gallery' : 'public-directory';
    if (input.method !== 'direct-public' || input.entry !== entry) fail(`${code}_PURPOSE`);
    const url = new URL(httpsUrl(input.url));
    if (url.href !== input.url || url.username || url.password || url.hash) fail(`${code}_URL`);
    const image = evidence(input.evidence, true), capture = evidence(input.capture, true);
    if (image.path !== `.omd/discovery/${lane}/entries/${image.sha256}.png`
      || capture.path !== `.omd/discovery/${lane}/entries/${capture.sha256}.json`) fail(`${code}_PATH`);
    return Object.freeze({ method: 'direct-public' as const, entry, url: url.href,
      reason: boundedText(input.reason, `${code}_REASON`), evidence: image, capture });
  });
  if (new Set(roots.map(root => root.capture.sha256)).size !== roots.length
    || new Set(roots.map(root => root.evidence.sha256)).size !== roots.length) fail(`${code}_DUPLICATE`);
  return Object.freeze(roots);
}

function lane(value: unknown, options: Readonly<{ keys: readonly string[]; code: string; design: boolean; direct: boolean }>): ResearchLane & Record<string, unknown> {
  const { keys, code, design, direct } = options;
  const input = record(value, code);
  exactKeys(input, [...keys, ...(Object.hasOwn(input, 'navigation') ? ['navigation'] : []),
    ...(direct && Object.hasOwn(input, 'discoveryRoots') ? ['discoveryRoots'] : [])], `${code}_KEYS`);
  const roots = Object.hasOwn(input, 'discoveryRoots') ? discoveryRoots(input.discoveryRoots, design) : undefined;
  if (!Array.isArray(input.sources) || input.sources.length === 0) fail(`${code}_SOURCE_COVERAGE`);
  const sources = input.sources.map((value, index) => source(value, design, index));
  if (new Set(sources.map((entry) => entry.id)).size !== sources.length) fail(`${code}_SOURCE_DUPLICATE`);
  if (!Array.isArray(input.searches) || (!input.searches.length && !roots?.length) || Object.keys(input.searches).length !== input.searches.length) fail('REFERENCE_RESEARCH_SEARCH_EXECUTION_REQUIRED');
  const navigation = input.navigation;
  if (navigation !== undefined && (!Array.isArray(navigation) || navigation.length > 100 || Object.keys(navigation).length !== navigation.length)) fail('REFERENCE_RESEARCH_NAVIGATION_INVALID');
  return { ...input, queries: texts(input.queries, `${code}_QUERY`, Boolean(roots?.length)), searches: input.searches.map(item => evidence(item, true)), sources,
    ...(roots === undefined ? {} : { discoveryRoots: roots }),
    ...(navigation === undefined ? {} : { navigation: (navigation as unknown[]).map(value => {
      const hop = record(value, 'REFERENCE_RESEARCH_NAVIGATION_INVALID');
      exactKeys(hop, ['url', 'evidence', 'capture'], 'REFERENCE_RESEARCH_NAVIGATION_KEYS');
      return { url: httpsUrl(hop.url), evidence: evidence(hop.evidence, true), capture: evidence(hop.capture, true) };
    }) }) };
}

export function parseReferenceResearch(value: unknown): ReferenceResearch {
  const input = record(value, 'REFERENCE_RESEARCH_INVALID');
  if (['reference-research-v1', 'reference-research-v2', 'reference-research-v3', 'reference-research-v4'].includes(input.schema as string)) fail('REFERENCE_RESEARCH_UPGRADE_REQUIRED: use omd schema reference-research; retain valid captures, run omd ref search or omd ref navigate --entry for native discovery evidence, and republish with omd ref research-set');
  const current = input.schema === REFERENCE_RESEARCH_SCHEMA;
  exactKeys(input, current ? REFERENCE_RESEARCH_KEYS : REFERENCE_RESEARCH_LEGACY_KEYS, 'REFERENCE_RESEARCH_KEYS');
  if (!current && input.schema !== 'reference-research-v6' && input.schema !== 'reference-research-v5') fail('REFERENCE_RESEARCH_SCHEMA');
  const sourceContractSha256 = digest(input.sourceContractSha256, 'REFERENCE_RESEARCH_SOURCE_CONTRACT_SHA');
  const direct = input.schema !== 'reference-research-v5';
  const domain = lane(input.domainReference, { keys: REFERENCE_RESEARCH_DOMAIN_KEYS, code: 'REFERENCE_RESEARCH_DOMAIN', design: false, direct });
  const design = lane(input.designReference, { keys: REFERENCE_RESEARCH_DESIGN_KEYS, code: 'REFERENCE_RESEARCH_DESIGN', design: true, direct });
  if (direct && domain.sources.length < 3) fail('REFERENCE_RESEARCH_DOMAIN_SOURCE_COVERAGE: new research requires at least three independently inspected comparable services');
  if (direct && new Set(domain.sources.map(entry => referenceServiceFamily(entry.url))).size < 3) fail('REFERENCE_RESEARCH_DOMAIN_SOURCE_DIVERSITY: use at least three independent service families; pages or subdomains under one operator such as GOV.UK count once');
  const visualDirections = design.sources.filter(entry => entry.visualRole === 'visual-direction');
  if (visualDirections.length === 0) fail('REFERENCE_RESEARCH_VISUAL_DIRECTION_REQUIRED: component/usability documentation alone cannot establish visual direction');
  if (current && visualDirections.length < 2) fail('REFERENCE_RESEARCH_DESIGN_SOURCE_COVERAGE: current research requires at least two independently inspected visual-direction sources');
  if (current && new Set(visualDirections.map(entry => referenceServiceFamily(entry.url))).size < 2) {
    fail('REFERENCE_RESEARCH_DESIGN_SOURCE_DIVERSITY: use at least two independent original design families; repeated pages, crops, or captures from one product count once');
  }
  if (current && new Set(visualDirections.map(discoveryItemIdentity)).size < 2) {
    fail('REFERENCE_RESEARCH_DESIGN_DISCOVERY_DIVERSITY: use distinct inspected gallery items for the visual comparison');
  }
  const serviceIdentity = direct ? referenceServiceFamily : referenceServiceHost;
  const domainHosts = new Set([...domain.sources, ...domain.discoveryRoots ?? []].map(entry => serviceIdentity(entry.url)));
  const designUrls = [...design.sources.flatMap(entry => [entry.url, requiredDiscovery(entry).url]), ...design.discoveryRoots?.map(entry => entry.url) ?? []];
  if (designUrls.some(url => domainHosts.has(serviceIdentity(url)))) fail('REFERENCE_RESEARCH_DOMAIN_AS_VISUAL_DIRECTION: domain and design must use independent service families; keep the domain capture and discover a separate visual source');
  const benchmarkSha256 = domain.benchmarkSha256 === null ? null : digest(domain.benchmarkSha256, 'REFERENCE_RESEARCH_BENCHMARK_SHA');
  const boardSha256 = digest(design.boardSha256, 'REFERENCE_RESEARCH_BOARD_SHA');
  const domainEvidence = [...domain.sources, ...domain.discoveryRoots ?? []].map(entry => entry.evidence);
  const domainPaths = new Set(domainEvidence.map(entry => entry.path));
  const domainHashes = new Set(domainEvidence.map(entry => entry.sha256));
  const designEvidence = [...design.sources.flatMap(entry => [entry.evidence, requiredDiscovery(entry).evidence]), ...design.discoveryRoots?.map(entry => entry.evidence) ?? []];
  if (designEvidence.some(item => domainPaths.has(item.path) || domainHashes.has(item.sha256))) fail('REFERENCE_RESEARCH_LANE_EVIDENCE_REUSED');
  const coverage = current ? parseMarketReferenceCoverage(input.marketCoverage, domain.sources, design.sources) : null;
  return Object.freeze({
    schema: input.schema as ReferenceResearch['schema'], sourceContractSha256,
    ...(current ? { marketCoverage: coverage } : {}),
    domainReference: Object.freeze({ queries: domain.queries, searches: domain.searches, sources: domain.sources, ...(domain.navigation === undefined ? {} : { navigation: domain.navigation }), ...(domain.discoveryRoots === undefined ? {} : { discoveryRoots: domain.discoveryRoots }), benchmarkSha256 }),
    designReference: Object.freeze({ queries: design.queries, searches: design.searches, sources: design.sources, ...(design.navigation === undefined ? {} : { navigation: design.navigation }), ...(design.discoveryRoots === undefined ? {} : { discoveryRoots: design.discoveryRoots }), boardSha256 }),
  });
}
