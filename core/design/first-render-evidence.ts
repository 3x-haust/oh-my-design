import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { critiqueFirstRender, parseFirstRenderSurface } from './first-render-critic.ts';
import { readDesignJudgment } from './judgment-files.ts';
import { withBrowser } from '../render/index.ts';
import { withLocalView } from '../render/stateful.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { listProductionSourceFiles } from '../source-seal/index.ts';
import { parseSlopScope } from '../slop/review.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { decodePng } from '../motion/energy.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';

const PATH = '.omd/first-render-critic.json';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fail = (message: string): never => { throw new Error(`FIRST_RENDER_REQUIRED: ${message}; rerun first-render check --page <local-build.html> --input <surface.json>`); };
const read = (root: string, path: string) => readStableProjectFile({ root: resolve(root), path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem() });
const sources = (root: string) => hash(canonicalJson(listProductionSourceFiles(root).map(path => ({ path, sha256: hash(read(root, path)) }))));
const pageScope = (page: unknown) => parseSlopScope({ schema: 'slop-scope-v1', views: [{ id: 'first-render', page, viewport: { width: 1280, height: 900 } }] })[0]!;

/** Captures the local build natively. The supplied visual interpretation is agent-authored,
 * not automatically verified from pixels; its exact bytes and target are nevertheless bound. */
export async function publishFirstRenderCheck(root: string, page: string, input: unknown, writer: ProjectWriteAdapter) {
  const scope = pageScope(page);
  const hypothesis = readDesignJudgment(root)?.hypothesis ?? fail('current design hypothesis is missing');
  const surface = parseFirstRenderSurface(input);
  const sourceSha256 = sources(root);
  const buildSha256 = servedProjectTreeSha256(root, scope.page);
  const bytes = await withBrowser(browser => withLocalView(browser, root, scope, page => page.screenshot({ fullPage: true, timeout: 5000 })));
  const capture = { path: `.omd/first-render/captures/${hash(bytes)}.png`, sha256: hash(bytes) };
  writer.writeContentAddressed(capture.path, bytes);
  if (sourceSha256 !== sources(root) || buildSha256 !== servedProjectTreeSha256(root, scope.page)
    || !isDeepStrictEqual(hypothesis, readDesignJudgment(root)?.hypothesis)) return fail('inputs changed during capture');
  const native = { schema: 'first-render-check-v2', page: scope.page, sourceSha256, buildSha256, capture,
    surface, report: critiqueFirstRender(hypothesis, surface), interpretation: 'agent-authored-not-attested' };
  const record = { ...native, signature: signNativeObservation(root, 'first-render-v2', hash(canonicalJson(native))) };
  const reportSha256 = hash(canonicalJson(record));
  const body = `${JSON.stringify({ ...record, reportSha256 }, null, 2)}\n`;
  writer.writeContentAddressed(`.omd/first-render/reports/${reportSha256}.json`, body);
  writer.write(PATH, body);
  return { ...record, reportSha256 };
}

/** A retained old report is not a certificate for a new hypothesis, source or build. */
export function checkFirstRenderEvidence(root: string) {
  if (!existsSync(resolve(root, PATH))) {
    if (existsSync(resolve(root, '.omd/design-judgment.json'))) return fail('report is missing');
    return null;
  }
  const bytes = read(root, PATH);
  const { reportSha256, ...record } = JSON.parse(bytes.toString('utf8'));
  if (record.schema !== 'first-render-check-v2' || typeof reportSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(reportSha256) || hash(canonicalJson(record)) !== reportSha256) return fail('report schema or digest is invalid');
  if (!bytes.equals(read(root, `.omd/first-render/reports/${reportSha256}.json`))) return fail('immutable report differs');
  const { signature, ...native } = record;
  if (typeof signature !== 'string' || !verifyNativeObservation(root, 'first-render-v2', hash(canonicalJson(native)), signature)) return fail('native capture signature invalid');
  const scope = pageScope(record.page);
  if (record.sourceSha256 !== sources(root) || record.buildSha256 !== servedProjectTreeSha256(root, scope.page)) return fail('source/build changed');
  const hypothesis = readDesignJudgment(root)?.hypothesis ?? fail('hypothesis is missing');
  if (!isDeepStrictEqual(record.report, critiqueFirstRender(hypothesis, record.surface))) return fail('hypothesis or critic result changed');
  if (!record.capture || typeof record.capture.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.capture.sha256)
    || record.capture.path !== `.omd/first-render/captures/${record.capture.sha256}.png`) return fail('capture binding is invalid');
  const capture = read(root, record.capture.path);
  if (hash(capture) !== record.capture.sha256) return fail('capture bytes changed');
  decodePng(capture);
  if (record.report.verdict !== 'retain') return fail('critical findings remain');
  return record;
}
