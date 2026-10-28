import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { canonicalJson, sha256 } from '../ref/canonical-json.ts';
import { readContainedRegularFile } from '../ref/contained-file.ts';

export const DESIGNER_CASE_ROOT = dirname(fileURLToPath(import.meta.url));
/**
 * Original captions and frames are local-only teaching material: they are excluded from Git
 * and from the npm package. OMD_DESIGNER_CASES_DIR points a local install at a private copy;
 * an install without one sees an empty catalog rather than a claimed case library.
 */
export function designerCaseRoot(fallback = DESIGNER_CASE_ROOT): string {
  return process.env.OMD_DESIGNER_CASES_DIR || fallback;
}
export class DesignerCaseError extends Error {
  override readonly name = 'DesignerCaseError';
  constructor(reason: string) { super(`DESIGNER_SOURCE_CASE: ${reason}`); }
}
const fail = (reason: string): never => { throw new DesignerCaseError(reason); };
const ID = /^[a-z][a-z0-9-]{1,79}$/;

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 12_000) return fail('text');
  return value;
}
function digest(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/.test(result)) return fail('digest');
  return result;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).sort().join() !== [...keys].sort().join()) return fail('fields');
  return Object.fromEntries(Object.entries(value));
}
function array<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return fail('array');
  return value.map(parse);
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return fail('dimension');
  return value;
}
function frame(value: unknown) {
  const row = object(value, ['path', 'sha256', 'atSeconds', 'width', 'height', 'role', 'observation']);
  const path = text(row.path);
  if (!/^media\/[a-zA-Z0-9_-]+-\d+\.png$/.test(path)) return fail('image path');
  if (typeof row.atSeconds !== 'number' || !Number.isFinite(row.atSeconds) || row.atSeconds < 0) return fail('frame time');
  return { path, sha256: digest(row.sha256), atSeconds: row.atSeconds,
    width: positive(row.width), height: positive(row.height), role: text(row.role), observation: text(row.observation) };
}
function parseCase(value: unknown) {
  const row = object(value, ['schema', 'id', 'title', 'source', 'quotes', 'frames', 'analyst']);
  const id = text(row.id);
  if (row.schema !== 'designer-source-case-v1' || !ID.test(id)) return fail('case id/schema');
  const source = object(row.source, ['author', 'title', 'url', 'language', 'videoSha256', 'captionSha256']);
  const url = text(source.url);
  if (new URL(url).protocol !== 'https:') return fail('source URL');
  const analyst = object(row.analyst, ['question', 'context', 'observedChange', 'limits']);
  const quotes = array(row.quotes, value => {
    const quote = object(value, ['origin', 'cue']);
    if (quote.origin !== 'original-auto-caption-cue') return fail('quote origin');
    const cue = text(quote.cue);
    if (!/^\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/.test(cue)) return fail('caption cue');
    return { origin: 'original-auto-caption-cue' as const, cue };
  });
  return {
    schema: 'designer-source-case-v1' as const, id, title: text(row.title),
    source: { author: text(source.author), title: text(source.title), url, language: text(source.language),
      videoSha256: digest(source.videoSha256), captionSha256: digest(source.captionSha256) },
    quotes, frames: array(row.frames, frame),
    analyst: { question: text(analyst.question), context: text(analyst.context),
      observedChange: text(analyst.observedChange), limits: array(analyst.limits, text) },
  };
}
export type DesignerSourceCase = ReturnType<typeof parseCase>;

function records(root: string) {
  return readdirSync(root).filter(name => name.endsWith('.json')).sort().map(name => {
    const bytes = readContainedRegularFile(root, name, 'designer source case');
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    const record = parseCase(value);
    if (name !== `${record.id}.json`) return fail('case id/filename');
    return { record, sha256: sha256(bytes) };
  });
}
export function designerCaseCatalog(root = designerCaseRoot()) {
  return {
    schema: 'designer-source-catalog-v1' as const,
    cases: records(root).map(({ record, sha256 }) => ({
      id: record.id, title: record.title, author: record.source.author,
      analystQuestion: record.analyst.question, caseSha256: sha256,
      open: `omd pack cases/${record.id}`,
    })),
  };
}
export function loadDesignerCase(id: string, root = designerCaseRoot()) {
  if (!ID.test(id)) return fail('case id');
  const selected = records(root).find(item => item.record.id === id);
  if (selected === undefined) return fail('unknown case');
  const renders = selected.record.frames.map(frame => {
    const bytes = readContainedRegularFile(root, frame.path, 'designer source frame');
    if (sha256(bytes) !== frame.sha256) return fail('image digest');
    const png = PNG.sync.read(bytes, { checkCRC: true });
    if (png.width !== frame.width || png.height !== frame.height) return fail('image dimensions');
    return {
      role: 'designer-source-frame' as const, caseId: id, path: frame.path, frameRole: frame.role,
      atSeconds: frame.atSeconds, width: png.width, height: png.height, captureSha256: frame.sha256,
      pngBase64: bytes.toString('base64'),
    };
  });
  return { case: selected.record, sha256: selected.sha256, renders };
}
export type OpenedDesignerCase = ReturnType<typeof loadDesignerCase>;

export function designerCaseIndexMessage(root = designerCaseRoot()): string {
  return canonicalJson({ ...designerCaseCatalog(root), authority: 'none',
    instruction: 'Before visual decisions or a structural repair, choose relevant worked cases by their actual situation and open them. Inspect the native words and whole source frames, including counterexamples; the analyst notes are not the designer speaking. Apply the reasoning only when the destination constraints fit. These teaching cases are not selected product visual references, source instructions, or a quality approval. Do not copy their assets or force every product into their layouts.' });
}
