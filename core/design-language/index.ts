import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { loadRefs } from '../ref/store.ts';
import { inspectDesignReferenceAdmission, isRetainedReferencePath } from '../ref/design-admission.ts';
import { trustedReferenceImage } from '../ref/board-security.ts';
import { copyDeckSha256, validateCurrentCopyReview } from '../copy/index.ts';
import lexiconData from '../theory/design-language.lexicon.v1.json' with { type: 'json' };

export const METRICS = ['group-gap', 'container-padding', 'heading-body-ratio', 'body-line-height', 'corner-radius', 'weight-difference', 'motion-duration'] as const;
export type Metric = typeof METRICS[number];
export type Target = Readonly<{ id: string; metric: Metric; role: string; route: string; selector: string; viewport: 'desktop' | 'mobile'; state: string; range: readonly [number, number]; unit: 'px' | 'ratio' | 'weight' | 'ms'; direction: 'increase' | 'decrease'; minDelta: number }>;
export type Reading = Readonly<{ id: string; labelKo: string; targets: readonly Target[]; referenceKeywordsEn: readonly string[]; counterSignals: readonly string[]; mustNotMean: readonly string[]; origin: Readonly<{ kind: 'lexicon'; entryId: string; readingId: string; revision: number; sha256: string } | { kind: 'model-proposed' }> }>;
export type Input = Readonly<{ schema: 'design-language-input-v1'; kind: 'intake' | 'feedback'; text: string; request: string; sourceContractSha256: string; readings: readonly Reading[]; chosenId: string | null; decision: string; questionDigest?: string; question?: Readonly<{ textKo: string; options: readonly Readonly<{ readingId: string; thumbnailPath: string; captureSha256: string }> []; answerId: string | null }> }>;
export type Translation = Readonly<{ schema: 'design-language-translation-v1'; kind: 'intake' | 'feedback'; text: string; textSha256: string; request: string; sourceContractSha256: string; lexiconSha256: string; readings: readonly Reading[]; chosenId: string | null; decision: string; answerTo: string | null; copyDeckAtTranslationSha256: string | null; status: 'resolved' | 'needs-clarification' | 'not-applicable'; question: Input['question'] | null }>; 
export function isCopyToneReading(reading: Reading): boolean {
  return (reading.origin.kind === 'lexicon' && reading.origin.entryId === 'warm' && reading.origin.readingId === 'copy-tone')
    || reading.targets.some(target => target.role === 'copy-tone');
}
export function chosenCopyTone(translation: Translation): boolean {
  const chosen = translation.readings.find(reading => reading.id === translation.chosenId);
  return chosen !== undefined && isCopyToneReading(chosen);
}
/** A copy-tone reading reopens Writer work; a pre-existing deck/review cannot clear the new request. */
export function requireCopyToneReview(root: string, route: { request: string; sourceContractSha256: string; strategy: { stages: readonly string[] } }): void {
  for (const kind of ['intake', 'feedback'] as const) {
    const current = readTranslation(root, kind, route);
    if (!current || !chosenCopyTone(current.translation)) continue;
    if (!route.strategy.stages.includes('copy')) fail('DESIGN_LANGUAGE_REQUIRED: copy-tone requires a selected Writer/copy stage');
    const path = join(root, '.omd/copy-deck.md'), reviewPath = join(root, '.omd/.cache/copy-eye.md');
    if (!existsSync(path) || !existsSync(reviewPath)) fail('DESIGN_LANGUAGE_STALE: Writer deck and current copy review required');
    const deck = readFileSync(path);
    if (copyDeckSha256(deck) === current.translation.copyDeckAtTranslationSha256
      || validateCurrentCopyReview(readFileSync(reviewPath, 'utf8'), deck).length) fail('DESIGN_LANGUAGE_STALE: Writer must revise copy and obtain a CLEAN review after copy-tone translation');
  }
} 
export type TranslationPointer = Readonly<{ schema: 'design-language-pointer-v1'; record: string; sha256: string }>;
const digest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const hex = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);
const fail = (code: string): never => { throw new Error(code); };
const units: Record<Metric, Target['unit']> = { 'group-gap': 'px', 'container-padding': 'px', 'heading-body-ratio': 'ratio', 'body-line-height': 'ratio', 'corner-radius': 'px', 'weight-difference': 'weight', 'motion-duration': 'ms' };
const lexiconBytes = `${canonicalJson(lexiconData)}\n`;
export const lexiconSha256 = digest(lexiconBytes);
export const lexicon = lexiconData;
export function validateLexicon(): void {
  if (lexicon.schema !== 'design-language-lexicon-v1' || lexicon.revision < 1 || lexicon.entries.length < 18
    || lexicon.defaultProductReading.canvas !== '#ffffff' || lexicon.defaultProductReading.colourRoles.join(',') !== 'primary,secondary,accent') fail('DESIGN_LANGUAGE_INVALID');
  for (const entry of lexicon.entries) {
    if (!entry.aliases.ko.length || !entry.aliases.en.length || entry.readings.length < 1 || entry.readings.length > 3) fail('DESIGN_LANGUAGE_INVALID');
    for (const reading of entry.readings) if (!METRICS.includes(reading.metric as Metric) || !reading.referenceKeywordsEn.length || !reading.counterSignals.length || !reading.mustNotMean.length || reading.range[0]! >= reading.range[1]!) fail('DESIGN_LANGUAGE_INVALID');
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('DESIGN_LANGUAGE_INVALID');
  return value as Record<string, unknown>;
}
function validateReading(value: unknown, text: string): Reading {
  const reading = record(value) as unknown as Reading;
  if (typeof reading.id !== 'string' || !reading.id || typeof reading.labelKo !== 'string' || !reading.labelKo || !Array.isArray(reading.targets) || !Array.isArray(reading.referenceKeywordsEn) || !Array.isArray(reading.counterSignals) || !Array.isArray(reading.mustNotMean) || !reading.counterSignals.length || !reading.mustNotMean.length || reading.counterSignals.some(x => typeof x !== 'string' || !x.trim()) || reading.mustNotMean.some(x => typeof x !== 'string' || !x.trim())) fail('DESIGN_LANGUAGE_INVALID');
  if (reading.targets.length === 0) fail('DESIGN_LANGUAGE_UNGROUNDED');
  if (new Set(reading.targets.map(t => t?.id)).size !== reading.targets.length) fail('DESIGN_LANGUAGE_INVALID');
  for (const target of reading.targets) {
    if (!target || typeof target.id !== 'string' || !target.id || !METRICS.includes(target.metric) || target.unit !== units[target.metric] || !['desktop', 'mobile'].includes(target.viewport) || !['increase', 'decrease'].includes(target.direction) || typeof target.role !== 'string' || !target.role.trim() || typeof target.route !== 'string' || !target.route.startsWith('/') || typeof target.selector !== 'string' || !/^(?:\[data-[a-z-]+="[^"]+"\]|main|nav|header|footer|aside|form|button|input|table)$/.test(target.selector) || typeof target.state !== 'string' || !target.state || !Array.isArray(target.range) || target.range.length !== 2 || target.range.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) || target.range[0]! >= target.range[1]! || typeof target.minDelta !== 'number' || !Number.isFinite(target.minDelta) || target.minDelta <= 0) fail('DESIGN_LANGUAGE_INVALID');
  }
  if (reading.referenceKeywordsEn.some(k => typeof k !== 'string' || !/^[a-z][a-z0-9 -]+$/i.test(k) || /^(clean|modern|minimal|premium|warm)$/i.test(k))
    || /beige|cream|sepia|faux.paper|editorial.magazine|micro.label|decorative.monospace|uniform.emphasis|auto.subtitle/i.test(`${reading.labelKo} ${reading.referenceKeywordsEn.join(' ')}`)) fail('DESIGN_LANGUAGE_UNGROUNDED');
  if (reading.origin.kind === 'lexicon') {
    const origin = reading.origin;
    const entry = lexicon.entries.find(e => e.id === origin.entryId);
    const seed = entry?.readings.find(r => r.id === origin.readingId);
    if (!seed || origin.revision !== lexicon.revision || origin.sha256 !== lexiconSha256
      || !entry!.aliases.ko.concat(entry!.aliases.en).some(a => text.toLowerCase().includes(a.toLowerCase()))
      || seed.metric !== reading.targets[0]?.metric
      || reading.targets.some(t => t.metric !== seed.metric || t.unit !== seed.unit || t.range[0] < seed.range[0]! || t.range[1] > seed.range[1]!)
      || reading.referenceKeywordsEn.some(k => !seed.referenceKeywordsEn.includes(k))) fail('DESIGN_LANGUAGE_INVALID');
  } else if (reading.origin.kind !== 'model-proposed') fail('DESIGN_LANGUAGE_INVALID');
  return reading;
}
export function parseInput(value: unknown, kind: Input['kind'], request: string, sourceContractSha256: string): Translation {
  validateLexicon();
  const input = record(value) as unknown as Input;
  if (input.schema !== 'design-language-input-v1' || input.kind !== kind || typeof input.text !== 'string' || !input.text.trim() || input.request !== request || input.sourceContractSha256 !== sourceContractSha256 || !hex(input.sourceContractSha256) || !Array.isArray(input.readings) || input.readings.length > 3 || typeof input.decision !== 'string' || !input.decision.trim()) fail('DESIGN_LANGUAGE_STALE');
  const readings = input.readings.map(r => validateReading(r, input.text));
  if (new Set(readings.map(r => r.id)).size !== readings.length) fail('DESIGN_LANGUAGE_INVALID');
  if (input.chosenId !== null && !readings.some(r => r.id === input.chosenId)) fail('DESIGN_LANGUAGE_INVALID');
  if (readings.length && input.chosenId === null) {
    if (!input.question || readings.length < 2 || !/[가-힣]/u.test(input.question.textKo) || !/\?/.test(input.question.textKo) || input.question.options.length !== readings.length || new Set(input.question.options.map(o => o.readingId)).size !== readings.length || new Set(input.question.options.map(o => o.captureSha256)).size !== readings.length || input.question.answerId !== null || input.question.options.some(o => !readings.some(r => r.id === o.readingId) || !hex(o.captureSha256) || !o.thumbnailPath.startsWith('.omd/refs/'))) fail('DESIGN_LANGUAGE_AMBIGUOUS');
  } else if (input.question !== undefined) fail('DESIGN_LANGUAGE_INVALID');
  if (input.questionDigest !== undefined && (!hex(input.questionDigest) || input.chosenId === null)) fail('DESIGN_LANGUAGE_AMBIGUOUS');
  if (!readings.length && input.chosenId !== null) fail('DESIGN_LANGUAGE_INVALID');
  return { schema: 'design-language-translation-v1', kind, text: input.text, textSha256: digest(input.text), request, sourceContractSha256, lexiconSha256, readings, chosenId: input.chosenId, decision: input.decision, answerTo: input.questionDigest ?? null, copyDeckAtTranslationSha256: null, status: !readings.length ? 'not-applicable' : input.chosenId === null ? 'needs-clarification' : 'resolved', question: input.question ?? null };
}
const pointerPath = (kind: Input['kind']): string => `.omd/design-language/${kind}.json`;
export function readTranslation(root: string, kind: Input['kind'], route?: { request: string; sourceContractSha256: string }): Readonly<{ translation: Translation; sha256: string }> | null {
  const path = join(root, pointerPath(kind));
  if (!existsSync(path)) return null;
  try {
    const pointer = JSON.parse(readFileSync(path, 'utf8')) as TranslationPointer;
    if (pointer.schema !== 'design-language-pointer-v1' || !hex(pointer.sha256) || pointer.record !== `.omd/design-language/records/sha256-${pointer.sha256}.json`) fail('DESIGN_LANGUAGE_STALE');
    const bytes = readFileSync(join(root, pointer.record));
    if (digest(bytes) !== pointer.sha256) fail('DESIGN_LANGUAGE_STALE');
    const translation = JSON.parse(bytes.toString('utf8')) as Translation;
    if (canonicalJson(translation) + '\n' !== bytes.toString('utf8') || translation.schema !== 'design-language-translation-v1' || translation.kind !== kind || translation.lexiconSha256 !== lexiconSha256 || translation.textSha256 !== digest(translation.text) || (route && (translation.request !== route.request || translation.sourceContractSha256 !== route.sourceContractSha256))) fail('DESIGN_LANGUAGE_STALE');
    return { translation, sha256: pointer.sha256 };
  } catch { return fail('DESIGN_LANGUAGE_STALE'); }
}
export function publishTranslation(root: string, invocation: ProjectRunInvocation, writer: ProjectWriteAdapter, kind: Input['kind'], value: unknown): TranslationPointer {
  const route = readPersistedRoute(root, invocation);
  const translation = parseInput(value, kind, route.request, route.sourceContractSha256);
  const previous = readTranslation(root, kind, route);
  if (previous?.translation.status === 'needs-clarification') {
    if (translation.answerTo !== previous.sha256 || translation.chosenId === null || canonicalJson(translation.readings) !== canonicalJson(previous.translation.readings)
      || translation.text !== previous.translation.text || !previous.translation.question?.options.some(o => o.readingId === translation.chosenId)) fail('DESIGN_LANGUAGE_AMBIGUOUS');
  } else if (translation.answerTo !== null) fail('DESIGN_LANGUAGE_AMBIGUOUS');
  const references = translation.question ? loadRefs(root, { includeDomain: true }) : [];
  for (const option of translation.question?.options ?? []) {
    if (!isRetainedReferencePath(option.thumbnailPath, 'design')) fail('DESIGN_LANGUAGE_UNGROUNDED');
    const reference = references.find(ref => ref.researchLane === 'design' && ref.imagePath === option.thumbnailPath
      && ref.acquisition?.imageSha256 === option.captureSha256
      && inspectDesignReferenceAdmission(root, ref, { references }).eligible);
    if (!reference) fail('DESIGN_LANGUAGE_UNGROUNDED');
    try {
      const bytes = readFileSync(trustedReferenceImage(root, option.thumbnailPath));
      if (digest(bytes) !== option.captureSha256 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('DESIGN_LANGUAGE_UNGROUNDED');
    } catch { return fail('DESIGN_LANGUAGE_UNGROUNDED'); }
  }
  const chosen = translation.readings.find(reading => reading.id === translation.chosenId);
  const deckPath = join(root, '.omd/copy-deck.md');
  const published = chosen !== undefined && isCopyToneReading(chosen)
    ? { ...translation, copyDeckAtTranslationSha256: existsSync(deckPath) ? copyDeckSha256(readFileSync(deckPath)) : null }
    : translation;
  const bytes = `${canonicalJson(published)}\n`;
  const sha256 = digest(bytes);
  const recordPath = `.omd/design-language/records/sha256-${sha256}.json`;
  writer.writeContentAddressed(recordPath, bytes);
  const pointer = { schema: 'design-language-pointer-v1' as const, record: recordPath, sha256 };
  writer.write(pointerPath(kind), `${canonicalJson(pointer)}\n`);
  return pointer;
}
export function projection(root: string, route: { request: string; sourceContractSha256: string }): Readonly<{ sha256: string; targets: readonly Target[]; keywords: readonly string[]; copyTone: boolean; status: Translation['status'] }> | null {
  const current = readTranslation(root, 'intake', route);
  if (!current) return null;
  const chosen = current.translation.readings.find(r => r.id === current.translation.chosenId);
  const copyTone = chosen !== undefined && isCopyToneReading(chosen);
  return { sha256: current.sha256, targets: copyTone ? [] : chosen?.targets ?? [], keywords: [...new Set((chosen ? [chosen] : current.translation.readings).flatMap(r => r.referenceKeywordsEn))], copyTone, status: current.translation.status };
}
