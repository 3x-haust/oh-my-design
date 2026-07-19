import { createHash } from 'node:crypto';
import { hasSourcePayload } from './board-sanitization.ts';
import { CompositeLineageFileError, readTrustedLineageFile, trustedComposite, trustedPrompt, writeExclusiveLineage } from './composite-lineage-files.ts';
import { readStableCurrentCompositeSelection, resolveCompositeLineageReaders, type ReferenceCompositeLineageReaders } from './composite-lineage-snapshot.ts';

export type { ReferenceCompositeLineageReaders } from './composite-lineage-snapshot.ts';

export const REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION = 'reference-composite-lineage-v1' as const;
export const PERMITTED_COMPOSITE_INPUT_CLASSES = [
  'sanitized-selected-assembly',
  'sanitized-principles',
  'sanitized-blueprints',
  'project-owned-concept-material',
] as const;

export type PermittedCompositeInputClass = (typeof PERMITTED_COMPOSITE_INPUT_CLASSES)[number];

type GeneratedReferenceCompositeLineage = {
  readonly schemaVersion: typeof REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION;
  readonly state: 'generated';
  readonly assemblySha256: string;
  readonly selectionSha256: string;
  readonly selectedCandidateId: string;
  readonly compositePath: string;
  readonly compositeSha256: string;
  readonly promptPath: string;
  readonly promptSha256: string;
  readonly provider: string;
  readonly hostCapability: 'image-generation';
  readonly permittedInputClasses: readonly PermittedCompositeInputClass[];
};

type UnavailableReferenceCompositeLineage = {
  readonly schemaVersion: typeof REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION;
  readonly state: 'unavailable';
  readonly reason: string;
};

export type ReferenceCompositeLineage = GeneratedReferenceCompositeLineage | UnavailableReferenceCompositeLineage;

type GeneratedRecordInput = {
  readonly state: 'generated';
  readonly compositePath: string;
  readonly promptPath: string;
  readonly provider: string;
  readonly hostCapability: 'image-generation';
  readonly permittedInputClasses: readonly PermittedCompositeInputClass[];
};

type UnavailableRecordInput = {
  readonly state: 'unavailable';
  readonly reason: string;
};

type RecordInput = GeneratedRecordInput | UnavailableRecordInput;
type StableGeneratedFiles = { readonly composite: { readonly path: string; readonly bytes: Buffer }; readonly prompt: { readonly path: string; readonly bytes: Buffer } };

export class ReferenceCompositeLineageValidationError extends Error {
  override readonly name = 'ReferenceCompositeLineageValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reference composite lineage is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new ReferenceCompositeLineageValidationError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const record = (value: unknown, label: string): Record<string, unknown> => isRecord(value) ? value : fail(`${label} must be an object`);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail(`${label} has unknown or missing keys`);
};
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown, label: string): string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : fail(`${label} must be 64 lowercase hexadecimal characters`);
const text = (value: unknown, label: string): string => typeof value === 'string' && value.trim() === value && value !== '' ? value : fail(`${label} must be a non-empty trimmed string`);
const safeText = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  if (hasSourcePayload(parsed)) fail(`${label} must not include a source carrier`);
  return parsed;
};
const exactInputClasses = (value: unknown): readonly PermittedCompositeInputClass[] => {
  if (!Array.isArray(value) || value.length !== PERMITTED_COMPOSITE_INPUT_CLASSES.length) return fail('permittedInputClasses must be the exact clean-room input list');
  for (const [index, inputClass] of PERMITTED_COMPOSITE_INPUT_CLASSES.entries()) {
    if (value[index] !== inputClass) fail('permittedInputClasses must be the exact clean-room input list');
  }
  return [...PERMITTED_COMPOSITE_INPUT_CLASSES];
};
const provider = (value: unknown): string => {
  const parsed = text(value, 'provider');
  return /^[a-z][a-z0-9-]{0,63}$/.test(parsed) ? parsed : fail('provider must be a local provider identifier');
};
const storedImagegenPath = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  const prefix = '.omd/.cache/imagegen/';
  if (!parsed.startsWith(prefix) || parsed.includes('\\') || parsed.includes('%') || parsed.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a canonical clean-room cache path`);
  return parsed;
};
const normalizePrompt = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const promptHasForbiddenImageryCarrier = (value: string): boolean => {
  const normalized = normalizePrompt(value);
  return hasSourcePayload(value)
    || /\b(?:captured\s+)?screenshots?\b/.test(normalized)
    || /\bpixels?\b/.test(normalized)
    || /\blikeness(?:es)?\b/.test(normalized)
    || /\bimage\s+reference\b|\bimagereference\b/.test(normalized)
    || /\bsource\s+images?\b/.test(normalized);
};
const cleanPromptBytes = (value: Uint8Array): Buffer => {
  const bytes = Buffer.from(value);
  if (bytes.length === 0) fail('prompt must not be empty');
  let prompt: string;
  try { prompt = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail('prompt must be UTF-8'); }
  if (promptHasForbiddenImageryCarrier(prompt)) fail('prompt must not include source imagery carriers');
  return bytes;
};

const parseRecordInput = (value: unknown): RecordInput => {
  const parsed = record(value, 'record input');
  switch (parsed['state']) {
    case 'generated':
      exactKeys(parsed, ['state', 'compositePath', 'promptPath', 'provider', 'hostCapability', 'permittedInputClasses'], 'generated record input');
      if (parsed['hostCapability'] !== 'image-generation') return fail('hostCapability must be image-generation');
      return {
        state: 'generated', compositePath: text(parsed['compositePath'], 'compositePath'), promptPath: text(parsed['promptPath'], 'promptPath'),
        provider: provider(parsed['provider']), hostCapability: 'image-generation', permittedInputClasses: exactInputClasses(parsed['permittedInputClasses']),
      };
    case 'unavailable':
      exactKeys(parsed, ['state', 'reason'], 'unavailable record input');
      return { state: 'unavailable', reason: safeText(parsed['reason'], 'reason') };
    default: return fail('state must be generated or unavailable');
  }
};

export function parseReferenceCompositeLineage(value: unknown): ReferenceCompositeLineage {
  const parsed = record(value, 'lineage');
  if (parsed['schemaVersion'] !== REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION) return fail(`schemaVersion must be ${REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION}`);
  switch (parsed['state']) {
    case 'generated':
      exactKeys(parsed, ['schemaVersion', 'state', 'assemblySha256', 'selectionSha256', 'selectedCandidateId', 'compositePath', 'compositeSha256', 'promptPath', 'promptSha256', 'provider', 'hostCapability', 'permittedInputClasses'], 'generated lineage');
      if (parsed['hostCapability'] !== 'image-generation') return fail('hostCapability must be image-generation');
      return {
        schemaVersion: REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION, state: 'generated', assemblySha256: sha(parsed['assemblySha256'], 'assemblySha256'),
        selectionSha256: sha(parsed['selectionSha256'], 'selectionSha256'), selectedCandidateId: safeText(parsed['selectedCandidateId'], 'selectedCandidateId'),
        compositePath: storedImagegenPath(parsed['compositePath'], 'compositePath'), compositeSha256: sha(parsed['compositeSha256'], 'compositeSha256'),
        promptPath: storedImagegenPath(parsed['promptPath'], 'promptPath'), promptSha256: sha(parsed['promptSha256'], 'promptSha256'), provider: provider(parsed['provider']),
        hostCapability: 'image-generation', permittedInputClasses: exactInputClasses(parsed['permittedInputClasses']),
      };
    case 'unavailable':
      exactKeys(parsed, ['schemaVersion', 'state', 'reason'], 'unavailable lineage');
      return { schemaVersion: REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION, state: 'unavailable', reason: safeText(parsed['reason'], 'reason') };
    default: return fail('state must be generated or unavailable');
  }
}

type CompositeLineageReaders = ReturnType<typeof resolveCompositeLineageReaders>;

const cleanComposite = (root: string, path: string, reader: CompositeLineageReaders['readComposite']) => {
  try { return reader(root, path); } catch (error) {
    if (error instanceof ReferenceCompositeLineageValidationError) throw error;
    if (error instanceof CompositeLineageFileError || error instanceof Error) return fail(`composite is unavailable: ${error.message}`);
    return fail('composite is unavailable');
  }
};
const cleanPrompt = (root: string, path: string, reader: CompositeLineageReaders['readPrompt']) => {
  try {
    const prompt = reader(root, path);
    return { ...prompt, bytes: cleanPromptBytes(prompt.bytes) };
  } catch (error) {
    if (error instanceof ReferenceCompositeLineageValidationError) throw error;
    if (error instanceof CompositeLineageFileError || error instanceof Error) return fail(`prompt is unavailable: ${error.message}`);
    return fail('prompt is unavailable');
  }
};
const sameFile = (left: { readonly path: string; readonly bytes: Buffer }, right: { readonly path: string; readonly bytes: Buffer }): boolean => left.path === right.path && left.bytes.equals(right.bytes);

const currentSelection = (root: string, reader: CompositeLineageReaders) => {
  try {
    return readStableCurrentCompositeSelection(root, reader);
  } catch (error) {
    if (error instanceof ReferenceCompositeLineageValidationError) throw error;
    if (error instanceof CompositeLineageFileError || error instanceof Error) return fail(`current selection is unavailable: ${error.message}`);
    return fail('current selection is unavailable');
  }
};

const stableGeneratedFiles = (root: string, compositePath: string, promptPath: string, reader: CompositeLineageReaders): StableGeneratedFiles => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const compositeBefore = cleanComposite(root, compositePath, reader.readComposite);
    const promptBefore = cleanPrompt(root, promptPath, reader.readPrompt);
    const compositeAfter = cleanComposite(root, compositePath, reader.readComposite);
    const promptAfter = cleanPrompt(root, promptPath, reader.readPrompt);
    if (sameFile(compositeBefore, compositeAfter) && sameFile(promptBefore, promptAfter)) return { composite: compositeBefore, prompt: promptBefore };
  }
  return fail('could not obtain a stable composite and prompt snapshot');
};

const checkedGenerated = (root: string, lineage: GeneratedReferenceCompositeLineage, reader: CompositeLineageReaders): GeneratedReferenceCompositeLineage => {
  const selection = currentSelection(root, reader);
  if (lineage.assemblySha256 !== selection.assemblySha256) fail('assembly hash does not match the current validated assembly');
  if (lineage.selectionSha256 !== selection.selectionSha256) fail('selection hash does not match the current hash-bound selection');
  if (lineage.selectedCandidateId !== selection.candidateId) fail('selected candidate does not match the current hash-bound selection');
  const files = stableGeneratedFiles(root, lineage.compositePath, lineage.promptPath, reader);
  if (lineage.compositePath !== files.composite.path || lineage.compositeSha256 !== sha256(files.composite.bytes)) fail('composite path or bytes do not match');
  if (lineage.promptPath !== files.prompt.path || lineage.promptSha256 !== sha256(files.prompt.bytes)) fail('prompt path or bytes do not match');
  return lineage;
};

export function checkReferenceCompositeLineage(root: string, overrides?: ReferenceCompositeLineageReaders): ReferenceCompositeLineage {
  const reader = resolveCompositeLineageReaders(overrides);
  let lineage: ReferenceCompositeLineage;
  try { lineage = parseReferenceCompositeLineage(JSON.parse(readTrustedLineageFile(root))); } catch (error) {
    if (error instanceof ReferenceCompositeLineageValidationError) throw error;
    if (error instanceof CompositeLineageFileError || error instanceof Error) return fail(`record is missing or invalid: ${error.message}`);
    return fail('record is missing or invalid');
  }
  switch (lineage.state) {
    case 'generated': return checkedGenerated(root, lineage, reader);
    case 'unavailable': return lineage;
  }
}

export function recordReferenceCompositeLineage(root: string, value: unknown, overrides?: ReferenceCompositeLineageReaders): ReferenceCompositeLineage {
  const reader = resolveCompositeLineageReaders(overrides);
  const input = parseRecordInput(value);
  let lineage: ReferenceCompositeLineage;
  switch (input.state) {
    case 'generated': {
      const selection = currentSelection(root, reader);
      const files = stableGeneratedFiles(root, input.compositePath, input.promptPath, reader);
      lineage = {
        schemaVersion: REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION, state: 'generated', assemblySha256: selection.assemblySha256,
        selectionSha256: selection.selectionSha256, selectedCandidateId: selection.candidateId, compositePath: files.composite.path,
        compositeSha256: sha256(files.composite.bytes), promptPath: files.prompt.path, promptSha256: sha256(files.prompt.bytes), provider: input.provider,
        hostCapability: input.hostCapability, permittedInputClasses: input.permittedInputClasses,
      };
      break;
    }
    case 'unavailable':
      lineage = { schemaVersion: REFERENCE_COMPOSITE_LINEAGE_SCHEMA_VERSION, state: 'unavailable', reason: input.reason };
      break;
  }
  try { writeExclusiveLineage(root, `${JSON.stringify(lineage)}\n`); } catch (error) {
    if (error instanceof ReferenceCompositeLineageValidationError) throw error;
    if (error instanceof CompositeLineageFileError || error instanceof Error) return fail(`record could not be written: ${error.message}`);
    return fail('record could not be written');
  }
  return lineage;
}
