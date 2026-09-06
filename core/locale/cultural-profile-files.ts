import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import {
  replaceProjectFileAtomically,
  writeContentAddressedProjectFile,
} from '../runtime/project-write.ts';
import {
  canonicalLocaleDesignJson,
  parseLocaleDesignRoute,
  routeLocaleDesignContext,
  type LocaleDesignRoute,
} from './design-context.ts';
import {
  CULTURAL_DESIGN_PROJECTION_SCHEMA,
  culturalDesignProfileSha256,
  culturalDesignProjectionSha256,
  projectCulturalDesignProfile,
  validateCulturalDesignProfile,
  type CulturalDesignProfile,
  type CulturalDesignProjection,
} from './cultural-profile.ts';
import { readCurrentCulturalDesignSource } from './source-capture-files.ts';

export const CULTURAL_DESIGN_PROFILE_POINTER_SCHEMA = 'cultural-design-profile-pointer-v1' as const;
export const CULTURAL_DESIGN_PROJECTION_POINTER_SCHEMA = 'cultural-design-projection-pointer-v1' as const;
export const CULTURAL_DESIGN_PROFILE_POINTER_PATH = '.omd/cultural-design-profile.json' as const;
export const CULTURAL_DESIGN_PROJECTION_POINTER_PATH = '.omd/cultural-design-projection.json' as const;

type Pointer = Readonly<{
  schema: typeof CULTURAL_DESIGN_PROFILE_POINTER_SCHEMA | typeof CULTURAL_DESIGN_PROJECTION_POINTER_SCHEMA;
  record: string;
  sha256: string;
  contextSha256: string;
}>;
export type CulturalDesignProfileCheck = Readonly<{
  profile: CulturalDesignProfile;
  profileSha256: string;
  profilePointerPath: typeof CULTURAL_DESIGN_PROFILE_POINTER_PATH;
  profileRecordPath: string;
  projection: CulturalDesignProjection;
  projectionSha256: string;
  projectionPointerPath: typeof CULTURAL_DESIGN_PROJECTION_POINTER_PATH;
  projectionRecordPath: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const PROFILE_RECORD = /^locale-profiles\/sha256-([a-f0-9]{64})\.json$/;
const PROJECTION_RECORD = /^locale-projections\/sha256-([a-f0-9]{64})\.json$/;

function bytesSha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

function parseJson(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { throw new Error(`LOCALE_DESIGN_PROFILE_INVALID: ${label} is not valid JSON`); }
}

function read(root: string, path: string, label: string): Buffer {
  try { return readContainedRegularFile(root, path, label); }
  catch (error) { throw new Error(`LOCALE_DESIGN_PROFILE_STALE: ${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

function pointer(
  value: unknown,
  schema: Pointer['schema'],
  pattern: RegExp,
  contextSha256: string,
): Pointer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) throw new Error('LOCALE_DESIGN_PROFILE_STALE: pointer must be a plain object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || record.schema !== schema
    || typeof record.record !== 'string' || typeof record.sha256 !== 'string' || !SHA256.test(record.sha256)
    || record.contextSha256 !== contextSha256) throw new Error('LOCALE_DESIGN_PROFILE_STALE: pointer fields do not match the current context');
  const match = pattern.exec(record.record);
  if (match === null || match[1] !== record.sha256) throw new Error('LOCALE_DESIGN_PROFILE_STALE: pointer record path does not match its hash');
  return Object.freeze({ schema, record: record.record, sha256: record.sha256, contextSha256 });
}

function currentLocaleRoute(root: string, invocation: ProjectRunInvocation): LocaleDesignRoute {
  const route = readPersistedRoute(root, invocation).sourceContract.localeDesign;
  if (route === undefined || route.decision !== 'research') throw new Error('LOCALE_DESIGN_RESEARCH_REQUIRED: current adaptive route has no locale research decision');
  return parseLocaleDesignRoute(route);
}

function currentLocaleRouteFromContext(root: string): LocaleDesignRoute {
  const value = parseJson(
    read(root, '.omd/locale-design-context.json', 'locale design context'),
    'locale design context',
  );
  const route = routeLocaleDesignContext(value);
  if (route.decision !== 'research') {
    throw new Error('LOCALE_DESIGN_RESEARCH_REQUIRED: current locale context has no research decision');
  }
  return route;
}

function validateProfileEvidence(root: string, profile: CulturalDesignProfile): void {
  const typeProofBytes = read(root, '.omd/type-proof.md', 'target-language type proof');
  if (bytesSha256(typeProofBytes) !== profile.typeProofSha256) {
    throw new Error('LOCALE_DESIGN_TYPE_PROOF_STALE: profile type-proof hash does not match current .omd/type-proof.md bytes');
  }
  for (const source of profile.sources) {
    readCurrentCulturalDesignSource(root, source, profile.contextSha256);
  }
}

function readCurrentCulturalDesignProfileForRoute(
  root: string,
  localeRoute: LocaleDesignRoute,
): CulturalDesignProfileCheck {
  const profilePointer = pointer(
    parseJson(read(root, CULTURAL_DESIGN_PROFILE_POINTER_PATH, 'cultural profile pointer'), 'cultural profile pointer'),
    CULTURAL_DESIGN_PROFILE_POINTER_SCHEMA,
    PROFILE_RECORD,
    localeRoute.contextSha256,
  );
  const profileRecordPath = `.omd/${profilePointer.record}`;
  const profileBytes = read(root, profileRecordPath, 'cultural profile record');
  if (bytesSha256(profileBytes) !== profilePointer.sha256) throw new Error('LOCALE_DESIGN_PROFILE_STALE: cultural profile bytes changed');
  const profile = validateCulturalDesignProfile(parseJson(profileBytes, 'cultural profile record'), localeRoute);
  if (culturalDesignProfileSha256(profile) !== profilePointer.sha256) throw new Error('LOCALE_DESIGN_PROFILE_STALE: cultural profile canonical hash changed');
  validateProfileEvidence(root, profile);

  const projectionPointer = pointer(
    parseJson(read(root, CULTURAL_DESIGN_PROJECTION_POINTER_PATH, 'cultural projection pointer'), 'cultural projection pointer'),
    CULTURAL_DESIGN_PROJECTION_POINTER_SCHEMA,
    PROJECTION_RECORD,
    localeRoute.contextSha256,
  );
  const projectionRecordPath = `.omd/${projectionPointer.record}`;
  const projectionBytes = read(root, projectionRecordPath, 'cultural projection record');
  if (bytesSha256(projectionBytes) !== projectionPointer.sha256) throw new Error('LOCALE_DESIGN_PROFILE_STALE: cultural projection bytes changed');
  const expectedProjection = projectCulturalDesignProfile(profile, localeRoute);
  const parsedProjection = parseJson(projectionBytes, 'cultural projection record');
  if (canonicalLocaleDesignJson(parsedProjection) !== canonicalLocaleDesignJson(expectedProjection)
    || expectedProjection.schema !== CULTURAL_DESIGN_PROJECTION_SCHEMA
    || culturalDesignProjectionSha256(expectedProjection) !== projectionPointer.sha256) {
    throw new Error('LOCALE_DESIGN_PROFILE_STALE: cultural projection is not derived from the current profile');
  }
  return Object.freeze({
    profile,
    profileSha256: profilePointer.sha256,
    profilePointerPath: CULTURAL_DESIGN_PROFILE_POINTER_PATH,
    profileRecordPath,
    projection: expectedProjection,
    projectionSha256: projectionPointer.sha256,
    projectionPointerPath: CULTURAL_DESIGN_PROJECTION_POINTER_PATH,
    projectionRecordPath,
  });
}

/**
 * Read-only currentness path for evidence consumers that already bind the exact locale-context
 * bytes but do not own a host invocation. Publication still requires the adaptive-route authority.
 */
export function readCurrentCulturalDesignProfileForContext(root: string): CulturalDesignProfileCheck {
  return readCurrentCulturalDesignProfileForRoute(root, currentLocaleRouteFromContext(root));
}

export function readCurrentCulturalDesignProfile(
  root: string,
  invocation: ProjectRunInvocation,
): CulturalDesignProfileCheck {
  return readCurrentCulturalDesignProfileForRoute(root, currentLocaleRoute(root, invocation));
}

export function publishCulturalDesignProfile(
  rootInput: string,
  value: unknown,
  invocation: ProjectRunInvocation,
): CulturalDesignProfileCheck {
  const root = resolve(rootInput);
  const localeRoute = currentLocaleRoute(root, invocation);
  const profile = validateCulturalDesignProfile(value, localeRoute);
  validateProfileEvidence(root, profile);
  const profileSha256 = culturalDesignProfileSha256(profile);
  const profileRecord = `locale-profiles/sha256-${profileSha256}.json`;
  const projection = projectCulturalDesignProfile(profile, localeRoute);
  const projectionSha256 = culturalDesignProjectionSha256(projection);
  const projectionRecord = `locale-projections/sha256-${projectionSha256}.json`;
  writeContentAddressedProjectFile({
    projectRoot: root,
    relativePath: `.omd/${profileRecord}`,
    content: `${canonicalLocaleDesignJson(profile)}\n`,
    invocation,
  });
  writeContentAddressedProjectFile({
    projectRoot: root,
    relativePath: `.omd/${projectionRecord}`,
    content: `${canonicalLocaleDesignJson(projection)}\n`,
    invocation,
  });
  replaceProjectFileAtomically({
    projectRoot: root,
    relativePath: CULTURAL_DESIGN_PROFILE_POINTER_PATH,
    content: `${canonicalLocaleDesignJson({
      schema: CULTURAL_DESIGN_PROFILE_POINTER_SCHEMA,
      record: profileRecord,
      sha256: profileSha256,
      contextSha256: localeRoute.contextSha256,
    })}\n`,
    invocation,
  });
  replaceProjectFileAtomically({
    projectRoot: root,
    relativePath: CULTURAL_DESIGN_PROJECTION_POINTER_PATH,
    content: `${canonicalLocaleDesignJson({
      schema: CULTURAL_DESIGN_PROJECTION_POINTER_SCHEMA,
      record: projectionRecord,
      sha256: projectionSha256,
      contextSha256: localeRoute.contextSha256,
    })}\n`,
    invocation,
  });
  return readCurrentCulturalDesignProfile(root, invocation);
}
