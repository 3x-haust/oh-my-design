import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { readPublishedReferenceResearch, validateReferenceResearch, REFERENCE_RESEARCH_PATH } from './reference-research.ts';

export const REFERENCE_APPLICATION_SCHEMA = 'reference-application-v1' as const;
export const REFERENCE_APPLICATION_PATH = '.omd/reference-application.json';
export const REFERENCE_APPLICATION_PROJECTION_PATH = '.omd/reference-application-projection.json';
export const REFERENCE_APPLICATION_DOC_PATH = '.omd/reference-application.md';
const DOMAIN_PATH = '.omd/domain-brief.json';
const fail = (message: string): never => { throw new Error(`REFERENCE_APPLICATION: ${message}`); };
const hash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const read = (root: string, path: string): Buffer => readStableProjectFile({
  root: resolve(root), path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem(),
});
type Options = Readonly<{ expectedSourceContractSha256: string; benchmarkRequired: boolean; expectedRequest?: string }>;
type ApplicationLane = Readonly<{
  referenceIds: readonly string[];
  coverage: 'direct' | 'partial' | 'brief-derived';
  gap: string | null;
  application: string;
  doNotTransfer: string;
  reason: string;
}>;
export type ReferenceApplication = Readonly<{
  schema: typeof REFERENCE_APPLICATION_SCHEMA;
  sourceContractSha256: string;
  researchSha256: string;
  domainBriefSha256: string;
  screens: readonly Readonly<{
    surface: string;
    domain: ApplicationLane;
    design: ApplicationLane;
    checks: readonly string[];
  }>[];
}>;

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return fail(`${label} must be plain data`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    return fail(`${label} requires exactly ${keys.join(', ')}`);
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) return fail(`${label} is missing`);
  return value.trim();
}
function texts(value: unknown, label: string, nonempty = true): readonly string[] {
  if (!Array.isArray(value) || (nonempty && !value.length)
    || Object.keys(value).length !== value.length) return fail(`${label} needs a dense array`);
  const items = value.map(item => text(item, label));
  if (new Set(items).size !== items.length) return fail(`${label} has duplicates`);
  return Object.freeze(items);
}
function sha(value: unknown, label: string): string {
  const result = text(value, label);
  return /^[a-f0-9]{64}$/.test(result) ? result : fail(`${label} needs SHA-256`);
}
function lane(value: unknown, label: string): ApplicationLane {
  const item = object(value, ['referenceIds', 'coverage', 'gap', 'application', 'doNotTransfer', 'reason'], label);
  if (!['direct', 'partial', 'brief-derived'].includes(item.coverage as string)) return fail(`${label}.coverage is invalid`);
  const referenceIds = texts(item.referenceIds, `${label}.referenceIds`, item.coverage !== 'brief-derived');
  if (item.coverage === 'brief-derived' && referenceIds.length) return fail(`${label}: brief-derived cannot claim reference evidence`);
  if (item.coverage === 'direct' && item.gap !== null) return fail(`${label}: direct coverage must have null gap`);
  const gap = item.coverage === 'direct' ? null : text(item.gap, `${label}.gap`);
  return Object.freeze({ referenceIds, coverage: item.coverage as ApplicationLane['coverage'], gap,
    application: text(item.application, `${label}.application`), doNotTransfer: text(item.doNotTransfer, `${label}.doNotTransfer`),
    reason: text(item.reason, `${label}.reason`) });
}
export function parseReferenceApplication(value: unknown): ReferenceApplication {
  const item = object(value, ['schema', 'sourceContractSha256', 'researchSha256', 'domainBriefSha256', 'screens'], 'application');
  if (item.schema !== REFERENCE_APPLICATION_SCHEMA) return fail('schema is invalid');
  if (!Array.isArray(item.screens) || !item.screens.length || item.screens.length > 12
    || Object.keys(item.screens).length !== item.screens.length) return fail('screens must contain 1–12 surface decisions');
  const screens = item.screens.map(value => {
    const row = object(value, ['surface', 'domain', 'design', 'checks'], 'screen');
    return Object.freeze({ surface: text(row.surface, 'surface'), domain: lane(row.domain, 'domain'),
      design: lane(row.design, 'design'), checks: texts(row.checks, 'checks') });
  });
  if (new Set(screens.map(screen => screen.surface)).size !== screens.length) return fail('duplicate surface');
  return Object.freeze({ schema: REFERENCE_APPLICATION_SCHEMA, sourceContractSha256: sha(item.sourceContractSha256, 'source contract'),
    researchSha256: sha(item.researchSha256, 'research'), domainBriefSha256: sha(item.domainBriefSha256, 'domain brief'), screens: Object.freeze(screens) });
}

function inputs(root: string, options: Options) {
  const researchBytes = read(root, REFERENCE_RESEARCH_PATH);
  const research = readPublishedReferenceResearch(root);
  validateReferenceResearch(root, research, options);
  if (!researchBytes.equals(read(root, REFERENCE_RESEARCH_PATH))) return fail('research changed while reading');
  const domainBytes = read(root, DOMAIN_PATH);
  const domain = validateDomainBrief(JSON.parse(domainBytes.toString('utf8')));
  if (options.expectedRequest !== undefined && domain.request !== options.expectedRequest.trim()) return fail('domain brief describes another request');
  return { research, domain, researchSha256: hash(researchBytes), domainBriefSha256: hash(domainBytes) };
}

/** A draft from current inputs, never invented analysis, coverage, or an approved direction. */
export function referenceApplicationPlan(root: string, options: Options) {
  const current = inputs(root, options);
  const draftLane = () => ({ referenceIds: [], coverage: 'partial', gap: '', application: '', doNotTransfer: '', reason: '' });
  return {
    input: { schema: REFERENCE_APPLICATION_SCHEMA, sourceContractSha256: options.expectedSourceContractSha256,
      researchSha256: current.researchSha256, domainBriefSha256: current.domainBriefSha256,
      screens: current.domain.surfaces.map(surface => ({ surface: surface.name, domain: draftLane(), design: draftLane(), checks: [] })) },
    evidence: { domain: current.research.domainReference.sources, design: current.research.designReference.sources },
    limitations: 'Inspect actual images. Fill the input; evidence is for the research owner, not downstream roles. This draft cannot pass apply-check.',
  };
}

/** Strip source identities/paths; carry destination decisions, not raw reference observations. */
export function projectReferenceApplication(application: ReferenceApplication) {
  const decision = ({ referenceIds: _referenceIds, ...rest }: ApplicationLane) => rest;
  return { schema: 'reference-application-projection-v1' as const, applicationSha256: hash(json(application)),
    screens: application.screens.map(row => ({ surface: row.surface, domain: decision(row.domain), design: decision(row.design), checks: row.checks })) };
}
export type ReferenceApplicationProjection = ReturnType<typeof projectReferenceApplication>;

function validate(root: string, application: ReferenceApplication, options: Options): void {
  const current = inputs(root, options);
  if (application.sourceContractSha256 !== options.expectedSourceContractSha256
    || application.researchSha256 !== current.researchSha256 || application.domainBriefSha256 !== current.domainBriefSha256) return fail('research/domain/source binding is stale; review affected decisions and republish');
  const surfaces = current.domain.surfaces.map(surface => surface.name);
  if (surfaces.length !== application.screens.length || surfaces.some(surface => !application.screens.some(row => row.surface === surface))) return fail('cover every current domain surface exactly once');
  for (const key of ['domain', 'design'] as const) {
    if (!application.screens.some(row => row[key].referenceIds.length > 0)) return fail(`${key}: collected research must inform at least one surface`);
  }
  for (const row of application.screens) for (const key of ['domain', 'design'] as const) {
    const sourceIds = new Set(current.research[key === 'domain' ? 'domainReference' : 'designReference'].sources.map(source => source.id));
    if (row[key].referenceIds.some(id => !sourceIds.has(id))) return fail(`${row.surface}/${key}: unknown or wrong-lane reference`);
    if (key === 'design' && row.design.coverage === 'direct' && !row.design.referenceIds.some(id =>
      current.research.designReference.sources.some(source => source.id === id && source.visualRole === 'visual-direction'))) return fail(`${row.surface}: support-only evidence cannot claim direct visual coverage`);
  }
  // Explicit URLs and acquisition paths belong only in the source-bearing record, not decision prose.
  const projection = JSON.stringify(projectReferenceApplication(application));
  if (/(?:https?:\/\/|www\.|\.omd\/refs\/)/i.test(projection)) return fail('keep source URLs/capture paths out of destination decision prose');
  for (const source of [...current.research.domainReference.sources, ...current.research.designReference.sources]) {
    if (projection.includes(new URL(source.url).hostname)) return fail('keep source hostnames out of destination decision prose');
  }
}

function markdown(application: ReferenceApplication): string {
  const line = (value: string): string => value.replace(/[<>]/g, '').replace(/\n/g, ' ');
  return ['# Screen reference application', '', 'A plan, not proof of rendered use, image inspection, or user approval.', '',
    ...application.screens.flatMap(row => [`## ${line(row.surface)}`, '',
      ...(['domain', 'design'] as const).flatMap(key => [
        `### ${key} — ${row[key].coverage}`, `References: ${row[key].referenceIds.map(line).join(', ') || 'none: brief-derived'}`,
        `- Apply: ${line(row[key].application)}`, `- Do not transfer: ${line(row[key].doNotTransfer)}`,
        `- Reason: ${line(row[key].reason)}`, ...(row[key].gap === null ? [] : [`- Gap: ${line(row[key].gap!)}`]), '',
      ]), '### Verify in the rendered result', ...row.checks.map(check => `- ${line(check)}`), '',
    ])].join('\n');
}
export function publishReferenceApplication(root: string, value: unknown, options: Options, writer: ProjectWriteAdapter) {
  const application = parseReferenceApplication(value);
  validate(root, application, options);
  writer.write(REFERENCE_APPLICATION_DOC_PATH, markdown(application));
  writer.write(REFERENCE_APPLICATION_PROJECTION_PATH, json(projectReferenceApplication(application)));
  writer.write(REFERENCE_APPLICATION_PATH, json(application));
  return application;
}
export function checkReferenceApplication(root: string, options: Options): ReferenceApplicationProjection {
  const bytes = read(root, REFERENCE_APPLICATION_PATH);
  const application = parseReferenceApplication(JSON.parse(bytes.toString('utf8')));
  validate(root, application, options);
  const projection = projectReferenceApplication(application);
  if (!read(root, REFERENCE_APPLICATION_PROJECTION_PATH).equals(Buffer.from(json(projection)))
    || !read(root, REFERENCE_APPLICATION_DOC_PATH).equals(Buffer.from(markdown(application)))
    || !bytes.equals(read(root, REFERENCE_APPLICATION_PATH))) return fail('publication is missing, interrupted, or changed');
  return projection;
}
