import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { withBrowser } from '../render/index.ts';
import { destinationRoute, pageRoute, withLocalView, type ViewState } from '../render/stateful.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { resolveCandidateSelection, validateCandidateSelectionPointer, type CandidateSelectionPointer } from './candidate-selection.ts';
import {
  candidateSourceInputDigests, captureCandidateSourceTree, parseCandidateSourceHistoryReference,
  persistCandidateSourceHistory, readCandidateSourceHistory, type CandidateSourceHistoryReference,
} from './candidate-source-history.ts';

export const CANDIDATE_VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;

type Render = Readonly<{
  path: string;
  sha256: string;
  viewport: Readonly<{ width: number; height: number }>;
  state?: string;
  route?: string;
}>;
export type CandidateVisualEvidence = Readonly<{
  treeSha256: string;
  sourceHistory?: CandidateSourceHistoryReference;
  planSha256?: string;
  renders: readonly Render[];
}>;
export type VisualCandidateSelection = Omit<CandidateSelectionPointer, 'schema' | 'visual'> & Readonly<{
  schema: 'candidate-selection-pointer-v2';
  visual: CandidateVisualEvidence;
}>;

const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const fail = (): never => { throw new Error('CANDIDATE_VISUAL_INVALID_OR_STALE'); };
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail();
  return Object.fromEntries(Object.entries(value));
};
const digest = (value: unknown): string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail();
const planHash = (states: readonly ViewState[]) => hash(Buffer.from(canonicalJson(states)));

export function parseCandidateVisual(value: unknown, captureStates?: readonly ViewState[]): CandidateVisualEvidence {
  const input = record(value);
  const expectedKeys = ['renders', 'treeSha256', ...(captureStates === undefined ? [] : ['planSha256']),
    ...(Object.hasOwn(input, 'sourceHistory') ? ['sourceHistory'] : [])];
  if (Object.keys(input).sort().join() !== expectedKeys.sort().join()
    || (captureStates !== undefined && input.planSha256 !== planHash(captureStates))
    || !Array.isArray(input.renders) || input.renders.length !== 2 * (1 + (captureStates?.length ?? 0))) return fail();
  const renders = input.renders.map((item, index): Render => {
    const row = record(item), viewport = record(row.viewport), expected = CANDIDATE_VIEWPORTS[index % 2];
    const state = index < 2 ? undefined : captureStates?.[Math.floor(index / 2) - 1];
    const sha256 = digest(row.sha256);
    const initialKeys = Object.hasOwn(row, 'route') ? 'path,route,sha256,viewport' : 'path,sha256,viewport';
    if (Object.keys(row).sort().join() !== (state === undefined ? initialKeys : 'path,route,sha256,state,viewport')
      || Object.keys(viewport).sort().join() !== 'height,width' || expected === undefined
      || (state !== undefined && (row.state !== state.name || row.route !== state.route))
      || viewport.width !== expected.width || viewport.height !== expected.height
      || row.path !== `.omd/.cache/candidate-renders/${sha256}.png`) return fail();
    return { path: row.path, sha256, viewport: { ...expected },
      ...(Object.hasOwn(row, 'route') ? { route: destinationRoute(row.route) } : {}),
      ...(state === undefined ? {} : { state: state.name }) };
  });
  const treeSha256 = digest(input.treeSha256);
  const sourceHistory = Object.hasOwn(input, 'sourceHistory')
    ? parseCandidateSourceHistoryReference(input.sourceHistory) : undefined;
  if (sourceHistory !== undefined && sourceHistory.treeSha256 !== treeSha256) return fail();
  return { treeSha256, renders, ...(sourceHistory === undefined ? {} : { sourceHistory }),
    ...(captureStates === undefined ? {} : { planSha256: planHash(captureStates) }) };
}

export function checkCandidateVisual(root: string, directory: string, visual: CandidateVisualEvidence, captureStates?: readonly ViewState[]): readonly string[] {
  parseCandidateVisual(visual, captureStates);
  if (servedProjectTreeSha256(root, `.omd/.cache/sketches/${directory}/index.html`) !== visual.treeSha256) return fail();
  if (visual.sourceHistory !== undefined) {
    const history = readCandidateSourceHistory(root, visual.sourceHistory);
    if (history.record.sourceEntryPath !== `.omd/.cache/sketches/${directory}/index.html`) return fail();
  }
  for (const render of visual.renders) {
    const bytes = readContainedRegularFile(root, render.path, 'selected candidate render');
    if (hash(bytes) !== render.sha256) return fail();
    const png = PNG.sync.read(bytes);
    if (png.width !== render.viewport.width || png.height !== render.viewport.height) return fail();
  }
  return visual.renders.map(render => render.path);
}

export async function captureCandidateSelection(
  root: string, pointer: CandidateSelectionPointer, writer: ProjectWriteAdapter,
): Promise<VisualCandidateSelection> {
  pointer = validateCandidateSelectionPointer(pointer);
  resolveCandidateSelection(root, pointer);
  const page = `.omd/.cache/sketches/${pointer.directory}/index.html`;
  const sourceCapture = captureCandidateSourceTree(root, page);
  const treeSha256 = sourceCapture.treeSha256;
  const captures = await withBrowser(async browser => {
    const results: Readonly<{ bytes: Buffer; viewport: Render['viewport']; route: string; state?: ViewState }>[] = [];
    for (const state of [undefined, ...(pointer.captureStates ?? [])]) for (const viewport of CANDIDATE_VIEWPORTS) {
      const capture = await withLocalView(browser, root, { page, viewport, ...(state === undefined ? {} : { state }) }, async tab => {
        await tab.evaluate(async () => {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          await Promise.all(document.getAnimations().filter(animation =>
            animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished));
        });
        const route = pageRoute(tab);
        const bytes = await tab.screenshot({ fullPage: false, timeout: 5000 });
        if (route !== pageRoute(tab)) return fail();
        return { bytes, route };
      });
      results.push({ ...capture, viewport, ...(state === undefined ? {} : { state }) });
    }
    return results;
  });
  if (treeSha256 !== servedProjectTreeSha256(root, page)) return fail();
  if (canonicalJson(sourceCapture.inputDigests) !== canonicalJson(candidateSourceInputDigests(root))) return fail();
  resolveCandidateSelection(root, pointer);
  const sourceHistory = persistCandidateSourceHistory(root, sourceCapture, writer);
  const renders = captures.map(({ bytes, viewport, state, route }) => {
    const sha256 = hash(bytes), path = `.omd/.cache/candidate-renders/${sha256}.png`;
    writer.writeContentAddressed(path, bytes);
    return { path, sha256, viewport, route, ...(state === undefined ? {} : { state: state.name }) };
  });
  return {
    schema: 'candidate-selection-pointer-v2', directory: pointer.directory,
    indexSha256: pointer.indexSha256, selectionSha256: pointer.selectionSha256,
    ...(pointer.captureStates === undefined ? {} : { captureStates: pointer.captureStates }),
    visual: { treeSha256, sourceHistory, renders,
      ...(pointer.captureStates === undefined ? {} : { planSha256: planHash(pointer.captureStates) }) },
  };
}
