import { createHash } from 'node:crypto';
import {
  canonicalLocaleDesignJson,
  parseLocaleDesignRoute,
  type LocaleDesignRoute,
} from './design-context.ts';

export const CULTURAL_DESIGN_PROFILE_SCHEMA = 'cultural-design-profile-v1' as const;
export const CULTURAL_DESIGN_PROJECTION_SCHEMA = 'cultural-design-projection-v1' as const;
export const CULTURAL_DESIGN_PROFILE_KEYS = [
  'schema', 'contextSha256', 'capturedAt', 'sources', 'brandInvariants',
  'authorizedMarketFacts', 'typeProofSha256', 'decisions', 'rejectedCliches', 'confidence',
] as const;
export const CULTURAL_DESIGN_SOURCE_LANES = [
  'standard', 'global-equivalent', 'native-category', 'counterexample',
] as const;
export const CULTURAL_DESIGN_SOURCE_STATUSES = ['captured', 'unavailable'] as const;
export const CULTURAL_DESIGN_AXES = [
  'typography', 'information-density', 'list-detail-hierarchy', 'navigation-labels',
  'evidence-presentation', 'image-treatment', 'motion',
] as const;
export const CULTURAL_DESIGN_DECISION_STATUSES = ['supported', 'shared', 'contested', 'unknown'] as const;

export type CulturalDesignSourceLane = (typeof CULTURAL_DESIGN_SOURCE_LANES)[number];
export type CulturalDesignSourceStatus = (typeof CULTURAL_DESIGN_SOURCE_STATUSES)[number];
export type CulturalDesignAxis = (typeof CULTURAL_DESIGN_AXES)[number];
export type CulturalDesignDecisionStatus = (typeof CULTURAL_DESIGN_DECISION_STATUSES)[number];
export type CulturalDesignSource = Readonly<{
  id: string;
  lane: CulturalDesignSourceLane;
  status: CulturalDesignSourceStatus;
  url: string | null;
  capturedAt: string | null;
  captureSha256: string | null;
  observation: string;
  scope: string;
}>;
export type CulturalDesignDecision = Readonly<{
  id: string;
  axis: CulturalDesignAxis;
  status: CulturalDesignDecisionStatus;
  sourceIds: readonly string[];
  counterexampleIds: readonly string[];
  mechanism: string | null;
  adaptation: string | null;
  avoid: string;
  falsifier: string;
}>;
export type CulturalDesignProfile = Readonly<{
  schema: typeof CULTURAL_DESIGN_PROFILE_SCHEMA;
  contextSha256: string;
  capturedAt: string;
  sources: readonly CulturalDesignSource[];
  brandInvariants: readonly string[];
  authorizedMarketFacts: readonly string[];
  typeProofSha256: string;
  decisions: readonly CulturalDesignDecision[];
  rejectedCliches: readonly string[];
  confidence: 'bounded' | 'contested';
}>;
export type CulturalDesignProjectionDecision = Readonly<{
  id: string;
  axis: CulturalDesignAxis;
  status: CulturalDesignDecisionStatus;
  mechanism: string | null;
  adaptation: string | null;
  avoid: string;
  falsifier: string;
}>;
export type CulturalDesignProjection = Readonly<{
  schema: typeof CULTURAL_DESIGN_PROJECTION_SCHEMA;
  contextSha256: string;
  profileSha256: string;
  surfaceLocale: string;
  marketRegion: string;
  audience: string;
  domain: string;
  surface: 'product' | 'marketing' | 'editorial' | 'mixed';
  brandInvariants: readonly string[];
  authorizedMarketFacts: readonly string[];
  typeProofSha256: string;
  decisions: readonly CulturalDesignProjectionDecision[];
  confidence: 'bounded' | 'contested';
  humanFitClaim: 'withheld';
}>;

export class CulturalDesignProfileError extends Error {
  override readonly name = 'CulturalDesignProfileError';
  readonly code: 'LOCALE_DESIGN_PROFILE_INVALID' | 'LOCALE_DESIGN_PROFILE_STALE' | 'LOCALE_DESIGN_SOURCE_LEAK';
  constructor(code: CulturalDesignProfileError['code'], message: string) { super(`${code}: ${message}`); this.code = code; }
}

const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const INVISIBLE = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
const SOURCE_LEAK = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|jp|kr|cn|tw)\b|(?:^|\s)(?:\.{0,2}\/|[A-Za-z]:\\)|\.(?:png|jpe?g|webp|gif|svg)\b|\[data-|<[^>]+>|(?:^|\s)#[A-Za-z])/i;

function fail(message: string): never { throw new CulturalDesignProfileError('LOCALE_DESIGN_PROFILE_INVALID', message); }
function stale(message: string): never { throw new CulturalDesignProfileError('LOCALE_DESIGN_PROFILE_STALE', message); }

function fields(value: unknown, expected: readonly string[], label: string): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return fail(`${label} must be a plain JSON object`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail(`${label} must contain exactly ${expected.join(', ')}`);
  }
  const result = new Map<string, unknown>();
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`${label}.${key} must be an enumerable data property`);
    }
    result.set(key, descriptor.value);
  }
  return result;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') return fail(`${label} must be text`);
  const normalized = value.trim();
  if (normalized.replace(INVISIBLE, '').length === 0) return fail(`${label} must contain visible text`);
  return normalized;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function timestamp(value: unknown, label: string): string {
  const parsed = text(value, label);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) {
    return fail(`${label} must be a canonical ISO timestamp`);
  }
  return parsed;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return fail(`${label} must be a plain array`);
  const keys = Reflect.ownKeys(value);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail(`${label} must contain only indexed data values`);
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`${label}[${index}] must be an enumerable data value`);
    }
    return descriptor.value;
  });
}

function strings(value: unknown, label: string, allowEmpty = true): readonly string[] {
  const result = array(value, label).map((entry, index) => text(entry, `${label}[${index}]`));
  if (!allowEmpty && result.length === 0) return fail(`${label} must not be empty`);
  if (new Set(result).size !== result.length) return fail(`${label} must be unique`);
  return Object.freeze(result);
}

function ids(value: unknown, label: string): readonly string[] {
  const result = strings(value, label);
  if (result.some((entry) => !ID.test(entry))) return fail(`${label} must contain lowercase kebab-case IDs`);
  return result;
}

function source(value: unknown, index: number): CulturalDesignSource {
  const label = `sources[${index}]`;
  const item = fields(value, ['id', 'lane', 'status', 'url', 'capturedAt', 'captureSha256', 'observation', 'scope'], label);
  const id = text(item.get('id'), `${label}.id`);
  if (!ID.test(id)) return fail(`${label}.id must be lowercase kebab-case`);
  const lane = item.get('lane');
  if (!CULTURAL_DESIGN_SOURCE_LANES.includes(lane as never)) return fail(`${label}.lane is unknown`);
  const status = item.get('status');
  if (!CULTURAL_DESIGN_SOURCE_STATUSES.includes(status as never)) return fail(`${label}.status is unknown`);
  let url: string | null = null;
  let capturedAt: string | null = null;
  let captureSha256: string | null = null;
  if (status === 'captured') {
    const rawUrl = text(item.get('url'), `${label}.url`);
    let parsedUrl: URL;
    try { parsedUrl = new URL(rawUrl); } catch { return fail(`${label}.url must be an HTTPS URL`); }
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username !== '' || parsedUrl.password !== '') {
      return fail(`${label}.url must be an HTTPS URL without credentials`);
    }
    url = parsedUrl.toString();
    capturedAt = timestamp(item.get('capturedAt'), `${label}.capturedAt`);
    const hash = item.get('captureSha256');
    if (typeof hash !== 'string' || !SHA256.test(hash)) return fail(`${label}.captureSha256 must be SHA-256`);
    captureSha256 = hash;
  } else {
    if (item.get('url') !== null || item.get('capturedAt') !== null) {
      return fail(`${label} unavailable source must use null URL and timestamp`);
    }
    const receiptHash = item.get('captureSha256');
    if (typeof receiptHash !== 'string' || !SHA256.test(receiptHash)) {
      return fail(`${label}.captureSha256 must bind a current unavailability receipt`);
    }
    captureSha256 = receiptHash;
  }
  return Object.freeze({
    id, lane: lane as CulturalDesignSourceLane, status: status as CulturalDesignSourceStatus,
    url, capturedAt, captureSha256,
    observation: text(item.get('observation'), `${label}.observation`),
    scope: text(item.get('scope'), `${label}.scope`),
  });
}

function decision(value: unknown, index: number): CulturalDesignDecision {
  const label = `decisions[${index}]`;
  const item = fields(value, [
    'id', 'axis', 'status', 'sourceIds', 'counterexampleIds', 'mechanism', 'adaptation', 'avoid', 'falsifier',
  ], label);
  const id = text(item.get('id'), `${label}.id`);
  if (!ID.test(id)) return fail(`${label}.id must be lowercase kebab-case`);
  const axis = item.get('axis');
  if (!CULTURAL_DESIGN_AXES.includes(axis as never)) return fail(`${label}.axis is unknown`);
  const status = item.get('status');
  if (!CULTURAL_DESIGN_DECISION_STATUSES.includes(status as never)) return fail(`${label}.status is unknown`);
  const mechanism = nullableText(item.get('mechanism'), `${label}.mechanism`);
  const adaptation = nullableText(item.get('adaptation'), `${label}.adaptation`);
  if ((status === 'supported' || status === 'shared') && (mechanism === null || adaptation === null)) {
    return fail(`${label} supported/shared decision needs mechanism and adaptation`);
  }
  if ((status === 'contested' || status === 'unknown') && (mechanism !== null || adaptation !== null)) {
    return fail(`${label} contested/unknown decision cannot transfer a mechanism or adaptation`);
  }
  return Object.freeze({
    id, axis: axis as CulturalDesignAxis, status: status as CulturalDesignDecisionStatus,
    sourceIds: ids(item.get('sourceIds'), `${label}.sourceIds`),
    counterexampleIds: ids(item.get('counterexampleIds'), `${label}.counterexampleIds`),
    mechanism, adaptation,
    avoid: text(item.get('avoid'), `${label}.avoid`),
    falsifier: text(item.get('falsifier'), `${label}.falsifier`),
  });
}

function safeTransfer(value: string, label: string): string {
  if (SOURCE_LEAK.test(value)) throw new CulturalDesignProfileError('LOCALE_DESIGN_SOURCE_LEAK', `${label} contains source identity, path, markup, or selector material`);
  return value;
}

function sha(value: unknown): string {
  return createHash('sha256').update(`${canonicalLocaleDesignJson(value)}\n`).digest('hex');
}

export function culturalDesignProfileSha256(profile: CulturalDesignProfile): string { return sha(profile); }
export function culturalDesignProjectionSha256(projection: CulturalDesignProjection): string { return sha(projection); }

export function validateCulturalDesignProfile(value: unknown, localeRoute: LocaleDesignRoute): CulturalDesignProfile {
  const route = parseLocaleDesignRoute(localeRoute);
  if (route.decision !== 'research') return fail('cultural profile requires a research locale route');
  const item = fields(value, CULTURAL_DESIGN_PROFILE_KEYS, 'profile');
  if (item.get('schema') !== CULTURAL_DESIGN_PROFILE_SCHEMA) return fail(`schema must be ${CULTURAL_DESIGN_PROFILE_SCHEMA}`);
  if (item.get('contextSha256') !== route.contextSha256) return stale('profile context does not match the current locale-design route');
  const profileSources = array(item.get('sources'), 'sources').map(source);
  if (profileSources.length === 0 || new Set(profileSources.map((entry) => entry.id)).size !== profileSources.length) {
    return fail('sources must contain unique source IDs');
  }
  const urls = profileSources.flatMap((entry) => entry.url === null ? [] : [entry.url]);
  if (new Set(urls).size !== urls.length) return fail('captured source URLs must be unique');
  const profileDecisions = array(item.get('decisions'), 'decisions').map(decision);
  if (profileDecisions.length !== CULTURAL_DESIGN_AXES.length
    || new Set(profileDecisions.map((entry) => entry.id)).size !== profileDecisions.length
    || new Set(profileDecisions.map((entry) => entry.axis)).size !== CULTURAL_DESIGN_AXES.length
    || CULTURAL_DESIGN_AXES.some((axis) => !profileDecisions.some((entry) => entry.axis === axis))) {
    return fail(`decisions must cover each axis exactly once: ${CULTURAL_DESIGN_AXES.join(', ')}`);
  }
  const sourceById = new Map(profileSources.map((entry) => [entry.id, entry]));
  const used = new Set<string>();
  for (const entry of profileDecisions) {
    for (const sourceId of [...entry.sourceIds, ...entry.counterexampleIds]) {
      if (!sourceById.has(sourceId)) return fail(`decision ${entry.id} references unknown source ${sourceId}`);
      used.add(sourceId);
    }
    if (entry.counterexampleIds.some((id) => sourceById.get(id)?.lane !== 'counterexample'
      || sourceById.get(id)?.status !== 'captured')) {
      return fail(`decision ${entry.id} counterexamples must be captured counterexample sources`);
    }
    if (entry.status === 'supported' || entry.status === 'shared') {
      const referenced = entry.sourceIds.map((id) => sourceById.get(id)!);
      const native = referenced.some((sourceEntry) => sourceEntry.lane === 'native-category' && sourceEntry.status === 'captured');
      const global = referenced.some((sourceEntry) => sourceEntry.lane === 'global-equivalent'
        && sourceEntry.status === 'captured');
      if (!native || !global || entry.counterexampleIds.length === 0) {
        return fail(`decision ${entry.id} needs captured native, captured global-equivalent, and counterexample evidence`);
      }
    }
    if (entry.status === 'contested' && (entry.sourceIds.length < 2 || entry.counterexampleIds.length === 0)) {
      return fail(`decision ${entry.id} contested status needs conflicting evidence and a counterexample`);
    }
  }
  if (profileSources.some((entry) => !used.has(entry.id))) return fail('every source must resolve at least one named decision');
  const brandInvariants = strings(item.get('brandInvariants'), 'brandInvariants');
  if (canonicalLocaleDesignJson(brandInvariants) !== canonicalLocaleDesignJson(route.context.brandInvariants)) {
    return stale('profile brand invariants do not match the current locale-design context');
  }
  const typeProofSha256 = item.get('typeProofSha256');
  if (typeof typeProofSha256 !== 'string' || !SHA256.test(typeProofSha256)) return fail('typeProofSha256 must be SHA-256');
  const confidence = item.get('confidence');
  if (confidence !== 'bounded' && confidence !== 'contested') return fail('confidence must be bounded or contested');
  const shouldBeContested = profileDecisions.some((entry) => entry.status === 'contested' || entry.status === 'unknown');
  if ((confidence === 'contested') !== shouldBeContested) return fail('confidence must reflect contested or unknown decisions');
  return Object.freeze({
    schema: CULTURAL_DESIGN_PROFILE_SCHEMA,
    contextSha256: route.contextSha256,
    capturedAt: timestamp(item.get('capturedAt'), 'capturedAt'),
    sources: Object.freeze(profileSources),
    brandInvariants,
    authorizedMarketFacts: strings(item.get('authorizedMarketFacts'), 'authorizedMarketFacts'),
    typeProofSha256,
    decisions: Object.freeze(profileDecisions),
    rejectedCliches: strings(item.get('rejectedCliches'), 'rejectedCliches'),
    confidence,
  });
}

export function projectCulturalDesignProfile(
  profileValue: unknown,
  localeRoute: LocaleDesignRoute,
): CulturalDesignProjection {
  const route = parseLocaleDesignRoute(localeRoute);
  const profile = validateCulturalDesignProfile(profileValue, route);
  if (route.context.marketRegion === null || route.context.audience === null) return stale('research projection needs explicit market and audience');
  const projectionDecisions = profile.decisions.map((entry) => Object.freeze({
    id: entry.id,
    axis: entry.axis,
    status: entry.status,
    mechanism: entry.mechanism === null ? null : safeTransfer(entry.mechanism, `${entry.id}.mechanism`),
    adaptation: entry.adaptation === null ? null : safeTransfer(entry.adaptation, `${entry.id}.adaptation`),
    avoid: safeTransfer(entry.avoid, `${entry.id}.avoid`),
    falsifier: safeTransfer(entry.falsifier, `${entry.id}.falsifier`),
  }));
  const authorizedMarketFacts = profile.authorizedMarketFacts.map((entry, index) => safeTransfer(entry, `authorizedMarketFacts[${index}]`));
  return Object.freeze({
    schema: CULTURAL_DESIGN_PROJECTION_SCHEMA,
    contextSha256: route.contextSha256,
    profileSha256: culturalDesignProfileSha256(profile),
    surfaceLocale: route.context.surfaceLocale,
    marketRegion: route.context.marketRegion,
    audience: route.context.audience,
    domain: route.context.domain,
    surface: route.context.surface,
    brandInvariants: profile.brandInvariants,
    authorizedMarketFacts: Object.freeze(authorizedMarketFacts),
    typeProofSha256: profile.typeProofSha256,
    decisions: Object.freeze(projectionDecisions),
    confidence: profile.confidence,
    humanFitClaim: 'withheld',
  });
}
