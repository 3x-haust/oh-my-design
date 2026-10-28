import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { contactSheetHtml, observeMotion, type MotionTimeline } from '../render/motion-timeline.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';

/**
 * A sampled load-and-scroll observation of the same build the first-render check captured, so the
 * early reviewer can judge choreography instead of inferring it from two still frames.
 */
export const FIRST_RENDER_MOTION_SCHEMA = 'first-render-motion-v1';
const DIRECTORY = '.omd/first-render/motion';
const fail = (reason: string): never => { throw new Error(`FIRST_RENDER_MOTION: ${reason}`); };
const recordPath = (reportSha256: string) => `${DIRECTORY}/${reportSha256}.json`;
const SECTION_LIMIT = 6;
const SECTION_STEP = 800;

export type FirstRenderMotionProjection = Readonly<{
  context: Readonly<{
    schema: typeof FIRST_RENDER_MOTION_SCHEMA;
    reportSha256: string;
    scope: 'sampled-desktop-load-scroll-and-reduced-motion-observation-not-a-quota';
    timeline: Omit<MotionTimeline, 'target'>;
  }>;
  renders: readonly Readonly<{ role: 'motion-contact-sheet' | 'scroll-section'; scrollY?: number; captureSha256: string;
    width: number; height: number; pngBase64: string }>[];
}>;

/**
 * The sheet's scroll thumbnails are too small to read, so the reviewer also gets full-size frames
 * below the entry: each starts at least SECTION_STEP below the last, and the page bottom is kept.
 */
export function scrollSections<T extends Readonly<{ label: string; atMs?: number }>>(frames: readonly T[]): (T & { scrollY: number })[] {
  const scrolled = frames.flatMap(frame => {
    const match = frame.atMs === undefined ? /^scroll (\d+)px$/.exec(frame.label) : null;
    return match ? [{ ...frame, scrollY: Number(match[1]) }] : [];
  });
  const kept: (T & { scrollY: number })[] = [];
  for (const frame of scrolled) {
    if (frame.scrollY - (kept.at(-1)?.scrollY ?? 0) >= SECTION_STEP) kept.push(frame);
  }
  const last = scrolled.at(-1);
  if (last && kept.at(-1) !== last && last.scrollY - (kept.at(-1)?.scrollY ?? 0) >= SECTION_STEP / 2) kept.push(last);
  return kept.slice(0, SECTION_LIMIT);
}

function pngSize(bytes: Buffer): Readonly<{ width: number; height: number }> {
  if (bytes.length < 24 || bytes.readUInt32BE(12) !== 0x49484452) return fail('contact sheet is not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function captureFirstRenderMotion(root: string, page: string, reportSha256: string,
  writer: ProjectWriteAdapter): Promise<FirstRenderMotionProjection> {
  const { timeline, frames } = await observeMotion(page, { viewport: { width: 1280, height: 900 } });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  let sheet: Buffer;
  try {
    const view = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await view.setContent(contactSheetHtml(timeline, frames), { waitUntil: 'load' });
    sheet = await view.screenshot({ fullPage: true });
  } finally { await browser.close(); }
  const { target: _target, ...observed } = timeline;
  const sections = scrollSections(frames);
  const record = { schema: FIRST_RENDER_MOTION_SCHEMA, reportSha256, timeline: observed, contactSheetSha256: sha256(sheet),
    sections: sections.map(frame => ({ scrollY: frame.scrollY, sha256: sha256(frame.png) })) };
  writer.writeContentAddressed(`${DIRECTORY}/${record.contactSheetSha256}.png`, sheet);
  for (const frame of sections) writer.writeContentAddressed(`${DIRECTORY}/${sha256(frame.png)}.png`, frame.png);
  writer.write(recordPath(reportSha256), canonicalJson({ ...record,
    signature: signNativeObservation(realpathSync(root), FIRST_RENDER_MOTION_SCHEMA, sha256(canonicalJson(record))) }));
  return firstRenderMotionProjection(root, reportSha256) ?? fail('record was not written');
}

/** Null when the check produced no observation; a present record must verify or the packet is refused. */
export function firstRenderMotionProjection(root: string, reportSha256: string): FirstRenderMotionProjection | null {
  if (!existsSync(join(root, recordPath(reportSha256)))) return null;
  const parsed: unknown = JSON.parse(readContainedRegularFile(root, recordPath(reportSha256), 'first render motion').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail('record');
  const { signature, ...record } = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort().join();
  if ((keys !== 'contactSheetSha256,reportSha256,schema,timeline' && keys !== 'contactSheetSha256,reportSha256,schema,sections,timeline')
    || record.schema !== FIRST_RENDER_MOTION_SCHEMA || record.reportSha256 !== reportSha256
    || typeof signature !== 'string' || typeof record.contactSheetSha256 !== 'string'
    || !verifyNativeObservation(realpathSync(root), FIRST_RENDER_MOTION_SCHEMA, sha256(canonicalJson(record)), signature)) {
    return fail('record changed');
  }
  const bytes = readContainedRegularFile(root, `${DIRECTORY}/${record.contactSheetSha256}.png`, 'first render motion');
  if (sha256(bytes) !== record.contactSheetSha256) return fail('contact sheet drift');
  const sections = record.sections === undefined ? [] : Array.isArray(record.sections) ? record.sections : fail('record');
  const sectionRenders = sections.map((value: unknown) => {
    const row = value as Record<string, unknown>;
    if (typeof row !== 'object' || row === null || Object.keys(row).sort().join() !== 'scrollY,sha256'
      || !Number.isInteger(row.scrollY) || typeof row.sha256 !== 'string') return fail('record');
    const frame = readContainedRegularFile(root, `${DIRECTORY}/${row.sha256}.png`, 'first render motion');
    if (sha256(frame) !== row.sha256) return fail('scroll section drift');
    return { role: 'scroll-section' as const, scrollY: row.scrollY as number, captureSha256: row.sha256, ...pngSize(frame),
      pngBase64: frame.toString('base64') };
  });
  return {
    context: { schema: FIRST_RENDER_MOTION_SCHEMA, reportSha256,
      scope: 'sampled-desktop-load-scroll-and-reduced-motion-observation-not-a-quota',
      timeline: record.timeline as Omit<MotionTimeline, 'target'> },
    renders: [{ role: 'motion-contact-sheet', captureSha256: record.contactSheetSha256, ...pngSize(bytes),
      pngBase64: bytes.toString('base64') }, ...sectionRenders],
  };
}
