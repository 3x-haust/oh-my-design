import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadDesignQualityObservationBindings } from '../evidence/final-v2-browser-observations.ts';
import type { FinalEvidenceV2GraphVariant } from '../evidence/final-v2-graph.ts';
import type { DesignQualityObservationBinding } from '../evidence/final-v2-design-quality.ts';
import { validateBrowserObservationDecisionLinks } from '../runtime/browser-observation.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ReferenceApplicationProjection } from './reference-application.ts';

export const REFERENCE_APPLICATION_REVIEW_PATH = '.omd/reference-application-review.json';
const SCHEMA = 'reference-application-review-v1';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fail = (message: string): never => { throw new Error(`REFERENCE_APPLICATION_REVIEW: ${message}`); };
type Receipt = Readonly<{ path: string; sha256: string }>;
type Context = Readonly<{
  application: ReferenceApplicationProjection;
  build: Receipt;
  sourceSeal: Receipt;
  observations: readonly DesignQualityObservationBinding[];
  captureIndex?: readonly Readonly<{ path: string; testedUrl: string; browserObservationSha256: string }>[];
}>;
type Result = Readonly<{
  criterionId: string; viewport: 'desktop' | 'mobile'; observationSha256: string;
  captureSha256: string; state: string; verdict: 'met' | 'revise' | 'justified-departure'; reason: string;
}>;
type Review = Readonly<{
  schema: typeof SCHEMA; applicationSha256: string; build: Receipt; sourceSeal: Receipt;
  results: readonly Result[];
}>;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail('expected plain data');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) return fail(`expected exactly ${keys.join(', ')}`);
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096 ? value.trim() : fail('missing or oversized text');
}
function sha(value: unknown): string { const result = text(value); return /^[a-f0-9]{64}$/.test(result) ? result : fail('invalid digest'); }
function receipt(value: unknown): Receipt {
  const row = record(value, ['path', 'sha256']);
  const path = text(row.path);
  if (!path.startsWith('.omd/') || path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..')) return fail('unsafe receipt path');
  return { path, sha256: sha(row.sha256) };
}
function parse(value: unknown): Review {
  const row = record(value, ['schema', 'applicationSha256', 'build', 'sourceSeal', 'results']);
  if (row.schema !== SCHEMA || !Array.isArray(row.results) || !row.results.length || row.results.length > 1024
    || Object.keys(row.results).length !== row.results.length) return fail('invalid schema/results');
  const results = row.results.map(value => {
    const item = record(value, ['criterionId', 'viewport', 'observationSha256', 'captureSha256', 'state', 'verdict', 'reason']);
    if (!['desktop', 'mobile'].includes(item.viewport as string) || !['met', 'revise', 'justified-departure'].includes(item.verdict as string)) return fail('invalid viewport/verdict');
    return { criterionId: sha(item.criterionId), viewport: item.viewport as Result['viewport'],
      observationSha256: sha(item.observationSha256), captureSha256: sha(item.captureSha256), state: text(item.state),
      verdict: item.verdict as Result['verdict'], reason: text(item.reason) };
  });
  return { schema: SCHEMA, applicationSha256: sha(row.applicationSha256), build: receipt(row.build), sourceSeal: receipt(row.sourceSeal), results };
}

/** Deterministic IDs change when either the destination surface or its actual criterion changes. */
export function referenceApplicationCriteria(application: ReferenceApplicationProjection) {
  return application.screens.flatMap(screen => screen.checks.map(check => ({
    criterionId: hash(JSON.stringify([screen.surface, screen.target, check])), surface: screen.surface, target: screen.target, check,
  })));
}
function read(root: string, path: string): Buffer {
  try { return readStableProjectFile({ root: resolve(root), path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem() }); }
  catch (error) { return fail(`${path} is unavailable or changed: ${error instanceof Error ? error.message : String(error)}`); }
}
/** Call only after the existing final-v2 checker has authenticated the graph. Never accepts caller-selected captures. */
export function referenceApplicationReviewContext(root: string, application: ReferenceApplicationProjection, graph: Pick<FinalEvidenceV2GraphVariant, 'buildIdentity' | 'sourceSeal' | 'observations'>): Context {
  const build = receipt({ path: graph.buildIdentity.path, sha256: graph.buildIdentity.sha256 });
  const sourceSeal = receipt({ path: graph.sourceSeal.path, sha256: graph.sourceSeal.sha256 });
  for (const item of [build, sourceSeal, ...graph.observations]) {
    if (hash(read(root, item.path)) !== item.sha256) return fail('final artifact changed');
  }
  const seal = JSON.parse(read(root, sourceSeal.path).toString('utf8'));
  if (seal.inputs?.referenceApplicationSha256 !== application.applicationSha256) return fail('source was sealed before the current application decisions; reseal and recapture');
  const observations = loadDesignQualityObservationBindings(root, nodeStableProjectFileSystem(), graph.observations.map(item => item.sha256));
  const decisions = read(root, '.omd/decision-graph.json');
  const captureIndex = graph.observations.flatMap(item => {
    const bytes = read(root, item.path);
    if (hash(bytes) !== item.sha256) return fail('final observation changed during review planning');
    const links = validateBrowserObservationDecisionLinks(JSON.parse(bytes.toString('utf8')).evidence, decisions, true)!;
    return links.observations.filter(row => observations.some(binding => binding.browserObservationSha256 === row.observationSha256))
      .map(row => ({ path: row.observableResult.capture.path, testedUrl: row.testedUrl, browserObservationSha256: row.observationSha256 }));
  });
  return { application, build, sourceSeal, observations, captureIndex };
}
export function referenceApplicationReviewPlan(context: Context) {
  const criteria = referenceApplicationCriteria(context.application);
  return {
    input: { schema: SCHEMA, applicationSha256: context.application.applicationSha256, build: context.build, sourceSeal: context.sourceSeal,
      results: criteria.flatMap(({ criterionId }) => (['desktop', 'mobile'] as const).map(viewport => ({ criterionId, viewport,
        observationSha256: '', captureSha256: '', state: '', verdict: 'revise', reason: '' }))) },
    criteria, observations: context.observations, captureIndex: context.captureIndex ?? [],
    limitations: 'Inspect the actual current captures for each surface/criterion. This skeleton cannot pass. Judgments are agent-authored, not independent human approval or a beauty score.',
  };
}
export function validateReferenceApplicationReview(value: unknown, context: Context, requireClosed = true): Review {
  const review = parse(value);
  if (review.applicationSha256 !== context.application.applicationSha256
    || review.build.path !== context.build.path || review.build.sha256 !== context.build.sha256
    || review.sourceSeal.path !== context.sourceSeal.path || review.sourceSeal.sha256 !== context.sourceSeal.sha256) return fail('application/build/source seal changed; inspect new captures and re-review');
  const required = new Set(referenceApplicationCriteria(context.application).flatMap(item => ['desktop', 'mobile'].map(viewport => `${item.criterionId}:${viewport}`)));
  const criteria = referenceApplicationCriteria(context.application);
  for (const item of review.results) {
    if (!required.delete(`${item.criterionId}:${item.viewport}`)) return fail('duplicate or unknown criterion/viewport');
    const criterion = criteria.find(row => row.criterionId === item.criterionId)!;
    if (!criterion.target || criterion.target.state !== item.state || !context.observations.some(observation => observation.observationSha256 === item.observationSha256
      && observation.captureSha256 === item.captureSha256 && observation.viewport === item.viewport && observation.state === item.state
      && context.captureIndex?.some(capture => {
        if (capture.browserObservationSha256 !== observation.browserObservationSha256) return false;
        const url = new URL(capture.testedUrl);
        return `${url.pathname}${url.search}${url.hash}` === criterion.target.route;
      }))) return fail(`result is not bound to the destination surface ${criterion.surface} and its exact current final route/state/viewport capture`);
    if (requireClosed && item.verdict === 'revise') return fail('unresolved criterion; repair, recapture, and re-review');
  }
  if (required.size) return fail('missing screen criteria or desktop/mobile review');
  return review;
}
export function publishReferenceApplicationReview(root: string, value: unknown, context: Context, writer: ProjectWriteAdapter) {
  // Recording a revise decision is allowed; it must never count as completion.
  const review = validateReferenceApplicationReview(value, context, false);
  const body = `${JSON.stringify(review, null, 2)}\n`;
  writer.write(`.omd/reference-application-reviews/sha256-${hash(body)}.json`, body);
  writer.write(REFERENCE_APPLICATION_REVIEW_PATH, body);
  return { path: REFERENCE_APPLICATION_REVIEW_PATH, closed: review.results.every(result => result.verdict !== 'revise'), independence: 'not-attested' };
}
export function checkReferenceApplicationReview(root: string, context: Context) {
  const bytes = read(root, REFERENCE_APPLICATION_REVIEW_PATH);
  const review = validateReferenceApplicationReview(JSON.parse(bytes.toString('utf8')), context);
  if (!bytes.equals(read(root, `.omd/reference-application-reviews/sha256-${hash(bytes)}.json`))) return fail('review history differs from current record');
  return { criteria: referenceApplicationCriteria(context.application).length, results: review.results.length, closed: true, independence: 'not-attested' };
}
