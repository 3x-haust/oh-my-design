import { isAbsolute } from 'node:path';
import { knownFields, type SchemaWarning } from '../judgment/schema.ts';
import { referenceServiceFamily, referenceServiceHost } from './design-discovery-sources.ts';
import { parseMarketReferenceCoverage } from './market-reference-coverage.ts';
import {
  REFERENCE_RESEARCH_DESIGN_KEYS, REFERENCE_RESEARCH_DOMAIN_KEYS, REFERENCE_RESEARCH_EVIDENCE_KEYS,
  REFERENCE_RESEARCH_KEYS, REFERENCE_RESEARCH_SCHEMA, REFERENCE_RESEARCH_SOURCE_KEYS, REFERENCE_RESEARCH_FUNCTIONAL_SOURCE_KEYS,
  type ReferenceResearch, type ResearchDiscoveryRoot, type ResearchEvidence, type ResearchLane, type ResearchSource, type FunctionalSource,
} from './reference-research-types.ts';

const REFERENCE_RESEARCH_LEGACY_KEYS = REFERENCE_RESEARCH_KEYS.filter(key => key !== 'marketCoverage');
const SHA256 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function fail(code: string): never { throw new Error(code); }

export function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string, fieldPath?: string): void {
  const actual = Object.keys(value);
  const missing = keys.filter(key => !actual.includes(key));
  if (missing.length) fail(fieldPath === undefined ? code : `${code}: ${fieldPath} missing=[${missing.join(',')}]`);
  const projected = knownFields(value, keys, [], fieldPath ?? code);
  if (projected.warnings.some(w => /(?:^|\.)(?:signature|author|publishedAt|invocationSha256|authority|hostReceipt)$/u.test(w.field))) fail(code);
  for (const warning of projected.warnings) process.emitWarning(`ignored optional field ${warning.field}`);
  // Callers project validated fields; never mutate agent input or signed source bytes.
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

function evidence(value: unknown, diagnostic: boolean | 'gallery-visit' = false, fieldPath?: string): ResearchEvidence {
  const input = record(value, fieldPath === undefined ? 'REFERENCE_RESEARCH_EVIDENCE_INVALID' : `REFERENCE_RESEARCH_EVIDENCE_INVALID: ${fieldPath}`);
  exactKeys(input, REFERENCE_RESEARCH_EVIDENCE_KEYS, 'REFERENCE_RESEARCH_EVIDENCE_KEYS', fieldPath);
  const pathError = fieldPath === undefined ? 'REFERENCE_RESEARCH_EVIDENCE_PATH'
    : `REFERENCE_RESEARCH_EVIDENCE_PATH: ${fieldPath}.path must be a project-relative retained reference path under .omd/refs/ or an exact content-addressed design gallery visit under .omd/discovery/design/navigation/`;
  const path = text(input.path, pathError);
  const allowedDiscovery = diagnostic === true ? path.startsWith('.omd/discovery/')
    : diagnostic === 'gallery-visit' && /^\.omd\/discovery\/design\/navigation\/[a-f0-9]{64}\.(?:png|json)$/.test(path);
  if (isAbsolute(path) || path.includes('\\') || path.split('/').includes('..')
    || !(path.startsWith('.omd/refs/') || allowedDiscovery)) fail(pathError);
  const shaError = fieldPath === undefined ? 'REFERENCE_RESEARCH_EVIDENCE_SHA'
    : `REFERENCE_RESEARCH_EVIDENCE_SHA: ${fieldPath}.sha256 must be 64 lowercase hexadecimal characters`;
  return Object.freeze({ path, sha256: digest(input.sha256, shaError) });
}

function source(value: unknown, design: boolean, index: number): ResearchSource {
  const fieldPath = `${design ? 'designReference' : 'domainReference'}.sources[${index}]`;
  const input = record(value, `REFERENCE_RESEARCH_SOURCE_INVALID: ${fieldPath}`);
  exactKeys(input, design ? [...REFERENCE_RESEARCH_SOURCE_KEYS,
    ...(Object.hasOwn(input, 'discovery') ? ['discovery'] : []), 'visualRole', 'visualAssessment']
    : REFERENCE_RESEARCH_SOURCE_KEYS, 'REFERENCE_RESEARCH_SOURCE_KEYS', fieldPath);
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
    if (input.discovery !== undefined) {
      const entry = record(input.discovery, 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_REQUIRED');
      exactKeys(entry, ['url', 'kind', 'access', 'qualityReason', 'evidence', 'capture'], 'REFERENCE_RESEARCH_DESIGN_DISCOVERY_KEYS');
      if (!['app-gallery', 'web-gallery', 'visual-bookmark', 'user-provided'].includes(entry.kind as string)) fail('REFERENCE_RESEARCH_DESIGN_DISCOVERY_KIND');
      if (entry.access !== 'free') fail('REFERENCE_RESEARCH_DESIGN_FREE_ACCESS_REQUIRED');
      discovery = Object.freeze({
        url: httpsUrl(entry.url), kind: entry.kind as NonNullable<ResearchSource['discovery']>['kind'],
        access: 'free', qualityReason: text(entry.qualityReason, 'REFERENCE_RESEARCH_DESIGN_QUALITY_REASON'),
        evidence: evidence(entry.evidence, 'gallery-visit', `${fieldPath}.discovery.evidence`),
        capture: evidence(entry.capture, 'gallery-visit', `${fieldPath}.discovery.capture`),
      });
    }
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

function requiredVisualAssessment(value: ResearchSource['visualAssessment']): NonNullable<ResearchSource['visualAssessment']> {
  if (value === undefined) fail('REFERENCE_RESEARCH_VISUAL_ASSESSMENT');
  return value;
}

function discoveryRoots(value: unknown, design: boolean): readonly ResearchDiscoveryRoot[] {
  const code = 'REFERENCE_RESEARCH_DISCOVERY_ROOT';
  if (!Array.isArray(value) || value.length > 100 || Object.keys(value).length !== value.length) fail(code);
  const lane = design ? 'design' : 'domain';
  const roots = value.map((value, index) => {
    const fieldPath = `${lane}Reference.discoveryRoots[${index}]`;
    const input = record(value, code);
    exactKeys(input, ['method', 'entry', 'url', 'reason', 'evidence', 'capture'], `${code}_KEYS`, fieldPath);
    const entry = design ? 'free-gallery' : 'public-directory';
    if (input.method !== 'direct-public' || input.entry !== entry) fail(`${code}_PURPOSE`);
    const url = new URL(httpsUrl(input.url));
    if (url.href !== input.url || url.username || url.password || url.hash) fail(`${code}_URL`);
    const image = evidence(input.evidence, true, `${fieldPath}.evidence`);
    const capture = evidence(input.capture, true, `${fieldPath}.capture`);
    const expectedImage = `.omd/discovery/${lane}/entries/${image.sha256}.png`;
    const expectedCapture = `.omd/discovery/${lane}/entries/${capture.sha256}.json`;
    if (image.path !== expectedImage) fail(`${code}_PATH: ${fieldPath}.evidence.path must equal ${expectedImage}`);
    if (capture.path !== expectedCapture) fail(`${code}_PATH: ${fieldPath}.capture.path must equal ${expectedCapture}`);
    return Object.freeze({ method: 'direct-public' as const, entry, url: url.href,
      reason: boundedText(input.reason, `${code}_REASON`), evidence: image, capture });
  });
  if (new Set(roots.map(root => root.capture.sha256)).size !== roots.length
    || new Set(roots.map(root => root.evidence.sha256)).size !== roots.length) fail(`${code}_DUPLICATE`);
  return Object.freeze(roots);
}

function leadReceipts(value: unknown, lane: 'domain' | 'design'): readonly ResearchEvidence[] {
  if (!Array.isArray(value) || value.length > 100 || Object.keys(value).length !== value.length) fail('REFERENCE_SEARCH_LEADS_INVALID');
  return value.map(item => {
    const row = record(item, 'REFERENCE_SEARCH_LEADS_INVALID');
    exactKeys(row, REFERENCE_RESEARCH_EVIDENCE_KEYS, 'REFERENCE_SEARCH_LEADS_INVALID');
    const sha256 = digest(row.sha256, 'REFERENCE_SEARCH_LEADS_INVALID');
    if (row.path !== `.omd/discovery/${lane}/leads/${sha256}.json`) fail('REFERENCE_SEARCH_LEADS_INVALID');
    return { path: row.path, sha256 };
  });
}
function lane(value: unknown, options: Readonly<{ keys: readonly string[]; code: string; design: boolean; direct: boolean; current?: boolean }>): ResearchLane & Record<string, unknown> {
  const { keys, code, design, direct } = options;
  const input = record(value, code);
  if (!direct && Object.hasOwn(input, 'discoveryRoots')) fail(`${code}_KEYS`);
  exactKeys(input, [...keys, ...(options.current && Object.hasOwn(input, 'leads') ? ['leads'] : []), ...(Object.hasOwn(input, 'navigation') ? ['navigation'] : []),
    ...(direct && Object.hasOwn(input, 'discoveryRoots') ? ['discoveryRoots'] : [])], `${code}_KEYS`);
  const roots = Object.hasOwn(input, 'discoveryRoots') ? discoveryRoots(input.discoveryRoots, design) : undefined;
  if (!Array.isArray(input.sources)) fail(`${code}_SOURCE_COVERAGE`);
  const sources = input.sources.map((value, index) => source(value, design, index));
  if (new Set(sources.map((entry) => entry.id)).size !== sources.length) fail(`${code}_SOURCE_DUPLICATE`);
  if (!Array.isArray(input.searches) || (!input.searches.length && !roots?.length && !Object.hasOwn(input, 'leads')) || Object.keys(input.searches).length !== input.searches.length) fail('REFERENCE_RESEARCH_SEARCH_EXECUTION_REQUIRED');
  const navigation = input.navigation;
  if (navigation !== undefined && (!Array.isArray(navigation) || navigation.length > 100 || Object.keys(navigation).length !== navigation.length)) fail('REFERENCE_RESEARCH_NAVIGATION_INVALID');
  return { ...(design ? { boardSha256: input.boardSha256 } : { benchmarkSha256: input.benchmarkSha256 }),
    queries: texts(input.queries, `${code}_QUERY`, Boolean(roots?.length) || Object.hasOwn(input, 'leads')), searches: input.searches.map(item => evidence(item, true)),
    ...(options.current && Object.hasOwn(input, 'leads') ? { leads: leadReceipts(input.leads, design ? 'design' : 'domain') } : {}), sources,
    ...(roots === undefined ? {} : { discoveryRoots: roots }),
    ...(navigation === undefined ? {} : { navigation: (navigation as unknown[]).map(value => {
      const hop = record(value, 'REFERENCE_RESEARCH_NAVIGATION_INVALID');
      exactKeys(hop, ['url', 'evidence', 'capture'], 'REFERENCE_RESEARCH_NAVIGATION_KEYS');
      return { url: httpsUrl(hop.url), evidence: evidence(hop.evidence, true), capture: evidence(hop.capture, true) };
    }) }) };
}

function functionalSource(value: unknown, index: number): FunctionalSource {
  const code = 'REFERENCE_DOMAIN_FEATURE_EVIDENCE_REQUIRED';
  const input = record(value, code);
  exactKeys(input, REFERENCE_RESEARCH_FUNCTIONAL_SOURCE_KEYS, code);
  const array = (value: unknown, nonempty = false): unknown[] => {
    if (!Array.isArray(value) || (nonempty && !value.length) || Object.keys(value).length !== value.length) fail(code);
    return value;
  };
  const entries = array(input.observations, true).map(value => {
    const row = record(value, code); exactKeys(row, ['url', 'capture'], code);
    return { url: httpsUrl(row.url), capture: evidence(row.capture, true) };
  });
  const features = array(input.features, true).map(value => {
    const row = record(value, code); exactKeys(row, ['id', 'observedLabel', 'finding', 'evidence'], code);
    const citations = array(row.evidence, true).map(value => {
      const citation = record(value, code);
      exactKeys(citation, ['observationSha256', 'field', 'quote', 'linkUrl'], code);
      if (!['observedText', 'taskText', 'linkLabels'].includes(citation.field as string)
        || (citation.field === 'linkLabels') !== (citation.linkUrl !== null)) fail(code);
      return { observationSha256: digest(citation.observationSha256, code),
        field: citation.field as 'observedText' | 'taskText' | 'linkLabels', quote: boundedText(citation.quote, code),
        linkUrl: citation.linkUrl === null ? null : httpsUrl(citation.linkUrl) };
    });
    return { id: boundedText(row.id, code), observedLabel: boundedText(row.observedLabel, code),
      finding: boundedText(row.finding, code), evidence: citations };
  });
  if (new Set(features.map(item => item.id)).size !== features.length) fail(code);
  const comparisons = (key: 'similarities' | 'differences') => array(input[key]).map(value => {
    const row = record(value, code); exactKeys(row, ['requestQuote', 'featureIds', 'assessment'], code);
    return { requestQuote: boundedText(row.requestQuote, code), featureIds: texts(row.featureIds, code),
      assessment: boundedText(row.assessment, code) };
  });
  const decisions = (key: 'adopt' | 'avoid') => array(input[key]).map(value => {
    const row = record(value, code); exactKeys(row, ['featureIds', 'action', 'reason'], code);
    return { featureIds: texts(row.featureIds, code), action: boundedText(row.action, code), reason: boundedText(row.reason, code) };
  });
  const similarities = comparisons('similarities'), differences = comparisons('differences');
  const adopt = decisions('adopt'), avoid = decisions('avoid');
  if (!similarities.length && !differences.length || !adopt.length && !avoid.length) fail(code);
  return { id: boundedText(input.id, code), url: httpsUrl(input.url), observations: entries,
    marketObservationSha256: digest(input.marketObservationSha256, code), features,
    similarities, differences, adopt, avoid, limitations: array(input.limitations).map(item => boundedText(item, code)) };
}

export function referenceResearchUnknownFieldWarnings(value: unknown): SchemaWarning[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const input = value as Record<string, unknown>;
  const warnings = knownFields(value, REFERENCE_RESEARCH_KEYS,
    input.schema === REFERENCE_RESEARCH_SCHEMA ? ['judgments'] : [], 'research').warnings;
  for (const lane of ['domainReference', 'designReference'] as const) {
    const source = input[lane];
    if (typeof source !== 'object' || source === null || Array.isArray(source)) continue;
    const keys = lane === 'domainReference' ? REFERENCE_RESEARCH_DOMAIN_KEYS : REFERENCE_RESEARCH_DESIGN_KEYS;
    warnings.push(...knownFields(source, keys, ['leads', 'navigation', 'discoveryRoots'], `research.${lane}`).warnings);
  }
  return warnings;
}

export function parseReferenceResearch(value: unknown): ReferenceResearch {
  const input = record(value, 'REFERENCE_RESEARCH_INVALID');
  if (['reference-research-v1', 'reference-research-v2', 'reference-research-v3', 'reference-research-v4'].includes(input.schema as string)) fail('REFERENCE_RESEARCH_UPGRADE_REQUIRED: use omd schema reference-research; retain valid captures, run omd ref search or omd ref navigate --entry for native discovery evidence, and republish with omd ref research-set');
  const current = input.schema === REFERENCE_RESEARCH_SCHEMA;
  const marketSchema = current || input.schema === 'reference-research-v7';
  exactKeys(input, [...(marketSchema ? REFERENCE_RESEARCH_KEYS : REFERENCE_RESEARCH_LEGACY_KEYS),
    ...(current && Object.hasOwn(input, 'judgments') ? ['judgments'] : [])], 'REFERENCE_RESEARCH_KEYS');
  if (!marketSchema && input.schema !== 'reference-research-v6' && input.schema !== 'reference-research-v5') fail('REFERENCE_RESEARCH_SCHEMA');
  const sourceContractSha256 = digest(input.sourceContractSha256, 'REFERENCE_RESEARCH_SOURCE_CONTRACT_SHA');
  const direct = input.schema !== 'reference-research-v5';
  const domain = current ? (() => {
    const row = record(input.domainReference, 'REFERENCE_RESEARCH_DOMAIN');
    exactKeys(row, [...REFERENCE_RESEARCH_DOMAIN_KEYS, ...(Object.hasOwn(row, 'leads') ? ['leads'] : [])], 'REFERENCE_RESEARCH_DOMAIN_KEYS');
    const parsed: Omit<ResearchLane, 'sources'> & { sources: readonly FunctionalSource[]; benchmarkSha256: string | null } = {
      sources: Array.isArray(row.sources) ? row.sources.map((item, index) => functionalSource(item, index)) : fail('REFERENCE_DOMAIN_FEATURE_EVIDENCE_REQUIRED'),
      queries: texts(row.queries, 'REFERENCE_RESEARCH_DOMAIN_QUERY', true),
      searches: Array.isArray(row.searches) ? row.searches.map(item => evidence(item, true)) : fail('REFERENCE_RESEARCH_SEARCH_EXECUTION_REQUIRED'),
      ...(Object.hasOwn(row, 'leads') ? { leads: leadReceipts(row.leads, 'domain') } : {}),
      benchmarkSha256: row.benchmarkSha256 === null ? null : digest(row.benchmarkSha256, 'REFERENCE_RESEARCH_BENCHMARK_SHA'),
    };
    return parsed;
  })() : lane(input.domainReference, { keys: REFERENCE_RESEARCH_DOMAIN_KEYS, code: 'REFERENCE_RESEARCH_DOMAIN', design: false, direct });
  const design = lane(input.designReference, { keys: REFERENCE_RESEARCH_DESIGN_KEYS, code: 'REFERENCE_RESEARCH_DESIGN', design: true, direct, current });
  // Source counts and family diversity are measurements for the research review, not refusal criteria.
  const serviceIdentity = direct ? referenceServiceFamily : referenceServiceHost;
  const domainHosts = new Set([...domain.sources, ...domain.discoveryRoots ?? []].map(entry => serviceIdentity(entry.url)));
  const designUrls = [...design.sources.flatMap(entry => entry.discovery ? [entry.url, entry.discovery.url] : [entry.url]), ...design.discoveryRoots?.map(entry => entry.url) ?? []];
  // A genuine source may inform both lanes; shared ownership is not independent corroboration.
  void designUrls; void domainHosts;
  const benchmarkSha256 = domain.benchmarkSha256 === null ? null : digest(domain.benchmarkSha256, 'REFERENCE_RESEARCH_BENCHMARK_SHA');
  const boardSha256 = digest(design.boardSha256, 'REFERENCE_RESEARCH_BOARD_SHA');
  const domainEvidence = [...domain.sources, ...domain.discoveryRoots ?? []].flatMap(entry => 'evidence' in entry ? [entry.evidence] : []);
  const domainPaths = new Set(domainEvidence.map(entry => entry.path));
  const domainHashes = new Set(domainEvidence.map(entry => entry.sha256));
  const designEvidence = [...design.sources.flatMap(entry => entry.discovery ? [entry.evidence, entry.discovery.evidence] : [entry.evidence]), ...design.discoveryRoots?.map(entry => entry.evidence) ?? []];
  // Reuse across lanes is allowed, but cannot be counted as independent evidence.
  void designEvidence; void domainPaths; void domainHashes;
  const coverage = marketSchema ? parseMarketReferenceCoverage(input.marketCoverage,
    current ? domain.sources.map(item => ({ id: item.id, url: item.url, evidence: { sha256: (item as FunctionalSource).marketObservationSha256 } }))
      : domain.sources as ResearchSource[], design.sources, current) : null;
  const judgments = Object.hasOwn(input, 'judgments') ? (() => {
    if (!current || !Array.isArray(input.judgments) || input.judgments.length > 100) fail('AI_JUDGMENT_INVALID');
    return input.judgments.map(value => {
      const row = record(value, 'AI_JUDGMENT_INVALID');
      exactKeys(row, ['path', 'sha256', 'purpose', 'subjectId'], 'AI_JUDGMENT_INVALID');
      const sha256 = digest(row.sha256, 'AI_JUDGMENT_INVALID');
      if (row.path !== `.omd/judgments/records/sha256-${sha256}.json`) fail('AI_JUDGMENT_INVALID');
      return { path: row.path, sha256, purpose: boundedText(row.purpose, 'AI_JUDGMENT_INVALID'),
        subjectId: boundedText(row.subjectId, 'AI_JUDGMENT_INVALID') };
    });
  })() : undefined;
  return Object.freeze({
    schema: input.schema as ReferenceResearch['schema'], sourceContractSha256,
    ...(judgments === undefined ? {} : { judgments }),
    ...(marketSchema ? { marketCoverage: coverage } : {}),
    domainReference: Object.freeze({ queries: domain.queries, searches: domain.searches, ...(domain.leads === undefined ? {} : { leads: domain.leads }), sources: domain.sources, ...(domain.navigation === undefined ? {} : { navigation: domain.navigation }), ...(domain.discoveryRoots === undefined ? {} : { discoveryRoots: domain.discoveryRoots }), benchmarkSha256 }),
    designReference: Object.freeze({ queries: design.queries, searches: design.searches, ...(design.leads === undefined ? {} : { leads: design.leads }), sources: design.sources, ...(design.navigation === undefined ? {} : { navigation: design.navigation }), ...(design.discoveryRoots === undefined ? {} : { discoveryRoots: design.discoveryRoots }), boardSha256 }),
  });
}
