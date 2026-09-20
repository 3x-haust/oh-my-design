import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { readStableProjectFile, nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { listProductionSourceFiles } from '../source-seal/index.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { withBrowser } from '../render/index.ts';
import { normalize } from '../ir/normalize.ts';
import { check, loadRules } from '../rules/engine.ts';
import { decodePng } from '../motion/energy.ts';
import { scanSlopSource } from './index.ts';
import type { RawIr } from '../types.ts';
import { parseViewState, withLocalView, statefulIr, type ViewState } from '../render/stateful.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';

export const SLOP_REVIEW_POINTER = '.omd/slop/latest.json';
type Receipt = { path: string; sha256: string };
type View = { id: string; page: string; viewport: { width: number; height: number }; state?: ViewState };
type Finding = { id: string; kind: 'source-candidate' | 'render-warning'; rule: string; path: string; viewId: string | null; question: string };
type Decision = { id: string; status: 'confirmed' | 'dismissed'; reason: string; viewIds: string[] };
type Resolution = { id: string; reason: string; viewIds: string[] };
type Checkpoint = {
  schema: 'slop-checkpoint-v1'; sourceSha256: string; rulesSha256: string;
  scope: View[]; builds: { page: string; sha256: string }[];
  views: { id: string; image: Receipt; viewportImage: Receipt; ir: Receipt }[]; findings: Finding[]; filesScanned: number;
  parent: { checkpoint: Receipt; review: Receipt } | null;
  signature: string;
};
type Review = { schema: 'slop-review-v1'; checkpointSha256: string; summary: string; decisions: Decision[]; resolved: Resolution[] };
type Pointer = { schema: 'slop-review-pointer-v1'; checkpoint: Receipt; review: Receipt | null };
const moduleDir = dirname(fileURLToPath(import.meta.url));
const rulesRoot = resolve(moduleDir, '../rules/builtin');
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fail = (message: string): never => { throw new Error(`SLOP_REVIEW_REQUIRED: ${message}`); };
const text = (value: unknown, label: string): string => typeof value === 'string' && value.trim() ? value.trim() : fail(`${label} is required`);
function obj(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== [...keys].sort().join()) fail(`${label} has unknown or missing fields`);
  return record;
}
function read(root: string, path: string): Buffer {
  return readStableProjectFile({ root, path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem() });
}
function receipt(value: unknown): Receipt {
  const input = obj(value, ['path', 'sha256'], 'receipt');
  if (typeof input.path !== 'string' || !/^\.omd\/slop\/(?:checkpoints|reviews|captures|ir)\/[a-f0-9]{64}\.(json|png)$/.test(input.path)
    || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)
    || !input.path.includes(`/${input.sha256}.`)) return fail('invalid content-addressed receipt');
  return { path: input.path, sha256: input.sha256 };
}
function bytesAt(root: string, item: Receipt): Buffer {
  receipt(item);
  const bytes = read(root, item.path);
  if (sha(bytes) !== item.sha256) fail(`stale evidence: ${item.path}`);
  return bytes;
}
function artifact<T>(root: string, item: Receipt): T { return JSON.parse(bytesAt(root, item).toString('utf8')) as T; }
function save(writer: ProjectWriteAdapter, directory: string, value: unknown): Receipt {
  const bytes = `${canonicalJson(value)}\n`, digest = sha(bytes), path = `.omd/slop/${directory}/${digest}.json`;
  writer.writeContentAddressed(path, bytes);
  return { path, sha256: digest };
}
function pointer(root: string): Pointer | null {
  if (!existsSync(join(root, SLOP_REVIEW_POINTER))) return null;
  const item = obj(JSON.parse(read(root, SLOP_REVIEW_POINTER).toString('utf8')), ['schema', 'checkpoint', 'review'], 'pointer');
  if (item.schema !== 'slop-review-pointer-v1') fail('invalid pointer schema');
  return { schema: 'slop-review-pointer-v1', checkpoint: receipt(item.checkpoint), review: item.review === null ? null : receipt(item.review) };
}
function sourceSha(root: string): string {
  return sha(canonicalJson(listProductionSourceFiles(root).map(path => ({ path, sha256: sha(read(root, path)) }))));
}
function rulesSha(): string {
  return sha(canonicalJson({ rules: loadRules(rulesRoot), implementations: ['index.ts', 'review.ts', '../rules/engine.ts', '../ir/normalize.ts'].map(path => sha(readFileSync(resolve(moduleDir, path)))) }));
}
export function parseSlopScope(value: unknown): View[] {
  const input = obj(value, ['schema', 'views'], 'scope');
  if (input.schema !== 'slop-scope-v1' || !Array.isArray(input.views) || !input.views.length || input.views.length > 24) return fail('scope needs 1–24 views');
  const views = input.views.map(raw => {
    const view = obj(raw, ['id', 'page', 'viewport', ...(raw && Object.hasOwn(raw, 'state') ? ['state'] : [])], 'view');
    const page = text(view.page, 'page');
    // Serve exact local build bytes, never an unrelated localhost server or a reference URL.
    if (!/^[\w./-]+\.html$/.test(page) || page.startsWith('/') || page.startsWith('.omd/') || page.split('/').some(part => !part || part === '.' || part === '..')) fail('view.page must be a contained local HTML build entry (e.g. dist/index.html), not a URL');
    const viewport = obj(view.viewport, ['width', 'height'], 'viewport');
    if (![viewport.width, viewport.height].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 240 && n <= 2560)) fail('invalid viewport');
    return { id: text(view.id, 'view id'), page, viewport: viewport as View['viewport'], ...(view.state === undefined ? {} : { state: parseViewState(view.state) }) };
  });
  if (new Set(views.map(view => view.id)).size !== views.length) fail('duplicate view IDs');
  return views;
}
function current(root: string, checkpoint: Checkpoint): void {
  const { signature, ...native } = checkpoint;
  if (typeof signature !== 'string' || !verifyNativeObservation(root, 'slop-checkpoint-v1', sha(canonicalJson(native)), signature)) fail('native checkpoint signature invalid; rerun slop checkpoint');
  if (checkpoint.schema !== 'slop-checkpoint-v1' || checkpoint.sourceSha256 !== sourceSha(root) || checkpoint.rulesSha256 !== rulesSha()) fail('checkpoint source or scanner/rules changed; rerender and rescan');
  for (const build of checkpoint.builds) if (servedProjectTreeSha256(root, build.page) !== build.sha256) fail('rendered build changed; rerender and rescan');
  const scan = scanSlopSource(root);
  const expectedSources = sourceFindings(scan);
  const expectedWarnings = checkpoint.views.flatMap(view => renderFindings(view.id, artifact<RawIr>(root, view.ir)));
  if (checkpoint.filesScanned !== scan.filesScanned
    || canonicalJson(checkpoint.findings.filter(f => f.kind === 'source-candidate')) !== canonicalJson(expectedSources)
    || canonicalJson(checkpoint.findings.filter(f => f.kind === 'render-warning')) !== canonicalJson(expectedWarnings)) fail('finding inventory does not match the current source scan and captured IR checks');
}
function sourceFindings(scan: ReturnType<typeof scanSlopSource>): Finding[] {
  return [...new Map(scan.candidates.map(candidate => {
    const finding: Finding = { id: sha(canonicalJson(candidate)), kind: 'source-candidate', rule: candidate.candidateId, path: `${candidate.path}:${candidate.line}`, viewId: null, question: candidate.reviewQuestion };
    return [finding.id, finding] as const;
  })).values()];
}
function renderFindings(viewId: string, raw: RawIr): Finding[] {
  return [...new Map(check(normalize(raw), loadRules(rulesRoot), { categories: ['slop'] }).map(warning => {
    const finding: Finding = { id: sha(canonicalJson({ view: viewId, rule: warning.id, path: warning.path })), kind: 'render-warning', rule: warning.id, path: warning.path, viewId, question: warning.message };
    return [finding.id, finding] as const;
  })).values()];
}
function validateReview(root: string, input: unknown, checkpointReceipt: Receipt, checkpoint: Checkpoint): Review {
  const item = obj(input, ['schema', 'checkpointSha256', 'summary', 'decisions', 'resolved'], 'review');
  if (item.schema !== 'slop-review-v1' || item.checkpointSha256 !== checkpointReceipt.sha256 || !Array.isArray(item.decisions) || !Array.isArray(item.resolved)) return fail('review must bind the current checkpoint');
  const validViews = new Set(checkpoint.views.map(view => view.id));
  const judgment = (value: unknown, decision: boolean): Decision | Resolution => {
    const entry = obj(value, decision ? ['id', 'status', 'reason', 'viewIds'] : ['id', 'reason', 'viewIds'], 'finding judgment');
    if (!Array.isArray(entry.viewIds) || !entry.viewIds.length || entry.viewIds.some(id => !validViews.has(id as string)) || new Set(entry.viewIds).size !== entry.viewIds.length) fail('judgment needs actual current view IDs');
    const base = { id: text(entry.id, 'finding ID'), reason: text(entry.reason, 'individual rendered reason'), viewIds: entry.viewIds as string[] };
    if (!decision) return base;
    if (entry.status !== 'confirmed' && entry.status !== 'dismissed') fail('resolve needs-render before publication; use confirmed or dismissed');
    return { ...base, status: entry.status as Decision['status'] };
  };
  const decisions = item.decisions.map(value => judgment(value, true) as Decision);
  const resolved = item.resolved.map(value => judgment(value, false) as Resolution);
  const exactIds = (actual: string[], expected: string[]): boolean => new Set(actual).size === actual.length && [...actual].sort().join() === [...expected].sort().join();
  if (!exactIds(decisions.map(d => d.id), checkpoint.findings.map(f => f.id))) fail('every source candidate and render warning needs exactly one judgment');
  for (const finding of checkpoint.findings) {
    if (finding.viewId && !decisions.find(d => d.id === finding.id)!.viewIds.includes(finding.viewId)) fail('render warning judgment must inspect its own view');
  }
  const parent = checkpoint.parent ? artifact<Review>(root, checkpoint.parent.review) : null;
  const outstanding = parent?.decisions.filter(d => d.status === 'confirmed').map(d => d.id) ?? [];
  if (!exactIds(resolved.map(d => d.id), outstanding)) fail('each previously confirmed issue needs an explicit after-render resolution');
  for (const resolution of resolved) {
    if (checkpoint.findings.some(f => f.id === resolution.id) && decisions.find(d => d.id === resolution.id)?.status !== 'dismissed') fail('a still-confirmed issue is not resolved');
  }
  return { schema: 'slop-review-v1', checkpointSha256: checkpointReceipt.sha256, summary: text(item.summary, 'render review summary'), decisions, resolved };
}

/** Native checkpoint: source scan + actual local-build render + existing slop IR linter.
 * Findings are advisory until a reviewer judges them. The two finding kinds stay distinct. */
export async function captureSlopCheckpoint(root: string, scopeInput: unknown, writer: ProjectWriteAdapter): Promise<{ checkpoint: Receipt; reviewInput: Review; findings: Finding[] }> {
  const scope = parseSlopScope(scopeInput);
  const previous = pointer(root);
  let parent: Checkpoint['parent'] = null;
  if (previous) {
    const previousReview = previous.review ?? fail('triage the previous checkpoint before rescan; do not erase unreviewed findings');
    const old = artifact<Checkpoint>(root, previous.checkpoint);
    const review = validateReview(root, artifact(root, previousReview), previous.checkpoint, old);
    if (review.decisions.some(d => d.status === 'confirmed') && canonicalJson(scope) !== canonicalJson(old.scope)) fail('cannot narrow/change scope while repairing confirmed findings');
    parent = { checkpoint: previous.checkpoint, review: previousReview };
  }
  const sourceSha256 = sourceSha(root), rulesSha256 = rulesSha();
  const builds = [...new Set(scope.map(v => v.page))].map(page => ({ page, sha256: servedProjectTreeSha256(root, page) }));
  const scan = scanSlopSource(root);
  const findings: Finding[] = sourceFindings(scan);
  const views: Checkpoint['views'] = [];
  const staging = `.omd/.cache/slop-${randomUUID()}`;
  writer.mkdir(staging);
  await withBrowser(async browser => {
    for (const [index, view] of scope.entries()) {
      const imagePath = `${staging}/${index}.png`;
      const captured = await withLocalView(browser, root, view, async page => {
        const raw = await statefulIr(page);
        const viewportPng = await page.screenshot({ timeout: 5000 });
        writer.write(imagePath, await page.screenshot({ fullPage: true, timeout: 5000 }));
        return { raw, viewportPng };
      });
      const bytes = read(root, imagePath), digest = sha(bytes), path = `.omd/slop/captures/${digest}.png`;
      writer.writeContentAddressed(path, bytes);
      const viewportSha = sha(captured.viewportPng), viewportPath = `.omd/slop/captures/${viewportSha}.png`;
      writer.writeContentAddressed(viewportPath, captured.viewportPng);
      views.push({ id: view.id, image: { path, sha256: digest }, viewportImage: { path: viewportPath, sha256: viewportSha }, ir: save(writer, 'ir', captured.raw) });
      findings.push(...renderFindings(view.id, captured.raw));
    }
  });
  const unsigned = { schema: 'slop-checkpoint-v1' as const, sourceSha256, rulesSha256, scope, builds, views,
    findings: [...new Map(findings.map(f => [f.id, f])).values()], filesScanned: scan.filesScanned, parent };
  const checkpoint: Checkpoint = { ...unsigned, signature: signNativeObservation(root, 'slop-checkpoint-v1', sha(canonicalJson(unsigned))) };
  current(root, checkpoint); // Refuse a source/build mutation during capture.
  const saved = save(writer, 'checkpoints', checkpoint);
  writer.write(SLOP_REVIEW_POINTER, `${canonicalJson({ schema: 'slop-review-pointer-v1', checkpoint: saved, review: null })}\n`);
  return { checkpoint: saved, findings: checkpoint.findings, reviewInput: { schema: 'slop-review-v1', checkpointSha256: saved.sha256, summary: '', decisions: checkpoint.findings.map(f => ({ id: f.id, status: 'confirmed', reason: '', viewIds: f.viewId ? [f.viewId] : [] })),
    resolved: parent ? artifact<Review>(root, parent.review).decisions.filter(d => d.status === 'confirmed').map(d => ({ id: d.id, reason: '', viewIds: [] })) : [] } };
}

export function publishSlopReview(root: string, input: unknown, writer: ProjectWriteAdapter): Receipt {
  const latest = pointer(root) ?? fail('run slop checkpoint first');
  const checkpoint = artifact<Checkpoint>(root, latest.checkpoint);
  current(root, checkpoint);
  const review = validateReview(root, input, latest.checkpoint, checkpoint);
  for (const view of checkpoint.views) decodePng(bytesAt(root, view.image));
  if (latest.review) fail('review is immutable; run another checkpoint for a new judgment');
  const saved = save(writer, 'reviews', review);
  writer.write(SLOP_REVIEW_POINTER, `${canonicalJson({ ...latest, review: saved })}\n`);
  return saved;
}

/** Terminal completion calls this; a log entry or a source scan alone is never sufficient. */
type ExpectedView = { page: string; width: number; height: number; route?: string; state?: string; capture?: Receipt };
function sameViewportPixels(root: string, native: Receipt, final: Receipt): boolean {
  const finalBytes = read(root, final.path);
  if (sha(finalBytes) !== final.sha256) fail('final state capture changed');
  const left = decodePng(bytesAt(root, native)), right = decodePng(finalBytes);
  if (left.width !== right.width || left.height !== right.height) return false;
  for (let pixel = 0; pixel < left.width * left.height; pixel++) for (let c = 0; c < 4; c++) {
    if ((c < left.channels ? left.pixels[pixel * left.channels + c] : 255)
      !== (c < right.channels ? right.pixels[pixel * right.channels + c] : 255)) return false;
  }
  return true;
}
export function checkSlopReview(root: string, expectedViews: readonly ExpectedView[] = []) {
  const latest = pointer(root) ?? fail('missing loop: run slop checkpoint, inspect renders, then slop review-set');
  if (!latest.review) fail('current checkpoint has no rendered review');
  const checkpoint = artifact<Checkpoint>(root, latest.checkpoint);
  current(root, checkpoint);
  for (const expected of expectedViews) {
    const matched = checkpoint.scope.filter(view => view.page === expected.page && view.viewport.width === expected.width && view.viewport.height === expected.height
      && (expected.route === undefined || view.state?.route === expected.route) && (expected.state === undefined || view.state?.name === expected.state));
    if (!matched.length) fail('checkpoint does not cover the final production entry/viewport/route/state');
    if (expected.state !== undefined && !expected.capture) fail('final state coverage requires its authenticated capture, not a state label alone');
    if (expected.capture && !matched.some(view => sameViewportPixels(root, checkpoint.views.find(v => v.id === view.id)!.viewportImage, expected.capture!))) fail('final state pixels differ from the reviewed native viewport; replay the same deterministic state and recapture both evaluations');
  }
  let cursor: Pointer | null = latest, rounds = 0;
  const seen = new Set<string>();
  while (cursor) {
    if (++rounds > 100 || seen.has(cursor.checkpoint.sha256)) fail('invalid/cyclic loop history');
    seen.add(cursor.checkpoint.sha256);
    const entry: Checkpoint = artifact<Checkpoint>(root, cursor.checkpoint);
    const reviewReceipt = cursor.review ?? fail('unreviewed history');
    const review = validateReview(root, artifact(root, reviewReceipt), cursor.checkpoint, entry);
    const { signature, ...native } = entry;
    if (typeof signature !== 'string' || !verifyNativeObservation(root, 'slop-checkpoint-v1', sha(canonicalJson(native)), signature)) fail('native checkpoint signature invalid');
    for (const view of entry.views) { decodePng(bytesAt(root, view.image)); decodePng(bytesAt(root, view.viewportImage)); }
    if (rounds === 1 && review.decisions.some(d => d.status === 'confirmed')) fail('confirmed issues remain; repair, rerender, rescan and review');
    if (entry.parent) {
      const previous = artifact<Checkpoint>(root, entry.parent.checkpoint);
      const parentReview = artifact<Review>(root, entry.parent.review);
      if (parentReview.decisions.some(d => d.status === 'confirmed') && canonicalJson(entry.scope) !== canonicalJson(previous.scope)) fail('repair scope changed');
      if (parentReview.decisions.some(d => d.status === 'confirmed') && entry.sourceSha256 === previous.sourceSha256 && canonicalJson(entry.builds) === canonicalJson(previous.builds)) fail('confirmed issues lack a source/build revision');
    }
    cursor = entry.parent ? { schema: 'slop-review-pointer-v1', ...entry.parent } : null;
  }
  return { status: 'reviewed' as const, rounds, checkpoint: latest.checkpoint, review: latest.review,
    findings: checkpoint.findings.length, independence: 'not-attested' as const };
}

/** The already validated final graph supplies the production target, not a caller's narrower scope. */
export function checkSlopFinalGraph(root: string, graph: unknown) {
  const value = graph as { schema?: string; productionSchema?: string; observations?: Receipt[] };
  const expected: ExpectedView[] = [];
  type FinalView = { testedUrl: string; testedState: string; viewport: { width: number; height: number }; observableResult: { capture: Receipt } };
  const stateViews: FinalView[] = [];
  const productionEntries = new Set<string>();
  for (const item of value.observations ?? []) {
    const bytes = read(root, item.path);
    if (sha(bytes) !== item.sha256) fail('final observation changed');
    const observation = JSON.parse(bytes.toString('utf8')) as { evidence?: { trustedOutcome?: { receiptSha256?: string }; browserObservations?: { observations?: FinalView[] } } };
    stateViews.push(...observation.evidence?.browserObservations?.observations ?? []);
    const digest = observation.evidence?.trustedOutcome?.receiptSha256;
    if (!digest) continue;
    if (!/^[a-f0-9]{64}$/.test(digest)) fail('invalid trusted browser receipt digest');
    const browser = JSON.parse(read(root, `.omd/trusted-browser-receipt-sha256-${digest}.json`).toString('utf8')) as { productionPath: string; captures: { width: number; height: number }[] };
    productionEntries.add(browser.productionPath);
    // Trusted final validation owns browser receipt authentication; this only joins its exact scope.
    for (const capture of browser.captures) expected.push({ page: browser.productionPath, width: capture.width, height: capture.height });
  }
  if (stateViews.length && productionEntries.size > 1) fail('multiple production entries need unambiguous state-to-entry binding; review one final production target at a time');
  if (productionEntries.size === 1) for (const view of stateViews) {
    const url = new URL(view.testedUrl);
    expected.push({ page: [...productionEntries][0]!, ...view.viewport, route: `${url.pathname}${url.search}${url.hash}`, state: view.testedState, capture: view.observableResult.capture });
  }
  if (!expected.length) {
    const legacy = value.schema === 'final-evidence-v2-graph'
      || (value.schema === 'final-evidence-v2-workflow-graph-v1' && value.productionSchema === 'final-evidence-v2-graph');
    if (!legacy) fail('final graph has no trusted production entry/viewport binding for the review loop');
    // Historical graphs have no trustedOutcome entry identity. They still require an actual closed
    // source/render loop, but cannot claim the stronger exact-final-entry scope binding.
    const result = checkSlopReview(root);
    const checkpoint = artifact<Checkpoint>(root, result.checkpoint);
    if (!checkpoint.scope.some(v => v.viewport.width >= 1000) || !checkpoint.scope.some(v => v.viewport.width <= 600)) fail('legacy completion needs both desktop and mobile reviewed views');
    return { ...result, scopeBinding: 'whole-source-and-declared-views' as const };
  }
  return { ...checkSlopReview(root, expected), scopeBinding: 'trusted-final-entry-and-viewports' as const };
}
