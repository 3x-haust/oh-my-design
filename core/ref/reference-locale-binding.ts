import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCurrentCulturalDesignProfileForContext } from '../locale/cultural-profile-files.ts';
import type { CulturalDesignSourceLane } from '../locale/cultural-profile.ts';
import { canonicalJson, readReferenceBoardArtifacts, sha256 } from './board-artifacts.ts';
import type { ResolvedReferenceBoardPiece } from './board-contract.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { localeDesignContextJsonSha256 } from '../locale/design-context.ts';

export const REFERENCE_LOCALE_BINDING_SCHEMA = 'reference-locale-binding-v1' as const;
export const REFERENCE_LOCALE_BINDING_EVIDENCE_SCHEMA = 'reference-locale-binding-evidence-v1' as const;
export const REFERENCE_LOCALE_BINDING_PATH = '.omd/reference-locale-binding.json' as const;
export const REFERENCE_LOCALE_BINDING_EVIDENCE_PATH = '.omd/reference-locale-binding-evidence.json' as const;

export type ReferenceLocaleBindingInput = Readonly<{
  bindings: readonly Readonly<{
    candidateId: string;
    slotId: string;
    localeDecisionId: string;
  }>[];
}>;

export type ReferenceLocaleBinding = Readonly<{
  schema: typeof REFERENCE_LOCALE_BINDING_SCHEMA;
  boardSha256: string;
  localeContextSha256: string;
  culturalProfileSha256: string;
  culturalProjectionSha256: string;
  bindings: readonly Readonly<{
    candidateId: string;
    slotId: string;
    localeDecisionId: string;
    sourceLane: 'native-category' | 'global-equivalent' | 'counterexample';
    disposition: 'positive' | 'anti-reference';
  }>[];
}>;

export type ReferenceLocaleBindingEvidence = Readonly<{
  schema: typeof REFERENCE_LOCALE_BINDING_EVIDENCE_SCHEMA;
  boardSha256: string;
  localeContextSha256: string;
  culturalProfileSha256: string;
  culturalProjectionSha256: string;
  bindings: readonly Readonly<{
    candidateId: string;
    slotId: string;
    localeDecisionId: string;
    sourceLane: 'native-category' | 'global-equivalent' | 'counterexample';
    disposition: 'positive' | 'anti-reference';
    sourceId: string;
    sourceCaptureSha256: string;
  }>[];
}>;

export type ReferenceLocaleBindingBundle = Readonly<{
  projection: ReferenceLocaleBinding;
  evidence: ReferenceLocaleBindingEvidence;
}>;

const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new Error(`REFERENCE_LOCALE_BINDING_INVALID: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return fail(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} must contain exactly ${keys.join(', ')}`);
  }
}

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) return fail(`${label} must be a lowercase kebab-case ID`);
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return fail(`${label} must be SHA-256`);
  return value;
}

function sourceUrl(piece: ResolvedReferenceBoardPiece): string {
  const value = piece.sourceKind === 'image-fragment'
    ? piece.provenance.sourcePage
    : piece.reference.source;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return fail(`slot ${piece.slotId} source is not an absolute URL`); }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
    return fail(`slot ${piece.slotId} source must be HTTPS without credentials`);
  }
  return parsed.toString();
}

function parseInput(value: unknown): ReferenceLocaleBindingInput {
  const root = record(value, 'input');
  exact(root, ['bindings'], 'input');
  if (!Array.isArray(root.bindings) || root.bindings.length === 0) return fail('bindings must be a non-empty array');
  const bindings = root.bindings.map((entry, index) => {
    const item = record(entry, `bindings[${index}]`);
    exact(item, ['candidateId', 'slotId', 'localeDecisionId'], `bindings[${index}]`);
    return Object.freeze({
      candidateId: id(item.candidateId, `bindings[${index}].candidateId`),
      slotId: id(item.slotId, `bindings[${index}].slotId`),
      localeDecisionId: id(item.localeDecisionId, `bindings[${index}].localeDecisionId`),
    });
  });
  const keys = bindings.map((entry) => `${entry.candidateId}\0${entry.slotId}`);
  if (new Set(keys).size !== keys.length) return fail('a candidate slot may be bound only once');
  return Object.freeze({ bindings: Object.freeze(bindings) });
}

function localLane(value: CulturalDesignSourceLane, label: string): 'native-category' | 'global-equivalent' | 'counterexample' {
  if (value !== 'native-category' && value !== 'global-equivalent' && value !== 'counterexample') {
    return fail(`${label} source lane ${value} cannot drive a reference component`);
  }
  return value;
}

export function buildReferenceLocaleBinding(root: string, value: unknown): ReferenceLocaleBindingBundle {
  const input = parseInput(value);
  const board = readReferenceBoardArtifacts(root);
  if (board.manifest.schemaVersion !== 'reference-board-v3' || board.manifest.localeContextSha256 === null) {
    return fail('a current market-grounded reference-board-v3 is required');
  }
  const contextBytes = readFileSync(join(root, '.omd', 'locale-design-context.json'));
  if (localeDesignContextJsonSha256(contextBytes) !== board.manifest.localeContextSha256) return fail('board locale context is stale');
  const locale = readCurrentCulturalDesignProfileForContext(root);
  const sourceByUrl = new Map(locale.profile.sources.flatMap((source) => source.url === null ? [] : [[source.url, source] as const]));
  const decisionById = new Map(locale.profile.decisions.map((decision) => [decision.id, decision]));
  const candidateById = new Map(board.resolved.candidates.map((candidate) => [candidate.id, candidate]));

  const resolved = input.bindings.map((binding) => {
    const candidate = candidateById.get(binding.candidateId) ?? fail(`unknown candidate ${binding.candidateId}`);
    const piece = candidate.pieces.find((entry) => entry.slotId === binding.slotId)
      ?? fail(`candidate ${binding.candidateId} has no slot ${binding.slotId}`);
    const decision = decisionById.get(binding.localeDecisionId)
      ?? fail(`unknown cultural decision ${binding.localeDecisionId}`);
    const source = sourceByUrl.get(sourceUrl(piece))
      ?? fail(`slot ${binding.slotId} source is not a captured source in the current cultural profile`);
    if (source.status !== 'captured' || source.captureSha256 === null) {
      return fail(`slot ${binding.slotId} source is not currently captured`);
    }
    const anti = piece.evidenceAxes.signal === 'anti-reference';
    if (anti) {
      if (source.lane !== 'counterexample' || !decision.counterexampleIds.includes(source.id)) {
        return fail(`anti-reference slot ${binding.slotId} must bind a counterexample source used by ${decision.id}`);
      }
    } else {
      if (decision.status !== 'supported' && decision.status !== 'shared') {
        return fail(`positive slot ${binding.slotId} cannot transfer ${decision.status} cultural decision ${decision.id}`);
      }
      if ((source.lane !== 'native-category' && source.lane !== 'global-equivalent')
        || !decision.sourceIds.includes(source.id)) {
        return fail(`positive slot ${binding.slotId} must bind a native or global source used by ${decision.id}`);
      }
    }
    const sourceLane = localLane(source.lane, `slot ${binding.slotId}`);
    return Object.freeze({
      ...binding,
      sourceLane,
      disposition: anti ? 'anti-reference' as const : 'positive' as const,
      sourceId: source.id,
      sourceCaptureSha256: source.captureSha256,
    });
  });

  for (const candidate of board.resolved.candidates) {
    const candidateRows = resolved.filter((entry) => entry.candidateId === candidate.id);
    if (!candidateRows.some((entry) => entry.disposition === 'positive' && entry.sourceLane === 'native-category')) {
      return fail(`candidate ${candidate.id} needs at least one positive native-category binding`);
    }
    for (const piece of candidate.pieces) {
      if (!sourceByUrl.has(sourceUrl(piece))) continue;
      if (!candidateRows.some((entry) => entry.slotId === piece.slotId)) {
        return fail(`candidate ${candidate.id} slot ${piece.slotId} uses current locale evidence without an explicit binding`);
      }
    }
  }

  const shared = {
    boardSha256: sha256(board.boardBytes),
    localeContextSha256: board.manifest.localeContextSha256,
    culturalProfileSha256: locale.profileSha256,
    culturalProjectionSha256: locale.projectionSha256,
  };
  const evidence: ReferenceLocaleBindingEvidence = Object.freeze({
    schema: REFERENCE_LOCALE_BINDING_EVIDENCE_SCHEMA,
    ...shared,
    bindings: Object.freeze(resolved.map((entry) => Object.freeze({ ...entry }))),
  });
  const projection: ReferenceLocaleBinding = Object.freeze({
    schema: REFERENCE_LOCALE_BINDING_SCHEMA,
    ...shared,
    bindings: Object.freeze(resolved.map(({ sourceId: _sourceId, sourceCaptureSha256: _capture, ...entry }) => Object.freeze(entry))),
  });
  return Object.freeze({ projection, evidence });
}

function jsonFile(root: string, path: string, label: string): unknown {
  let bytes: Buffer;
  try { bytes = readContainedRegularFile(root, path, label); }
  catch (error) { throw new Error(`REFERENCE_LOCALE_BINDING_STALE: ${label}: ${error instanceof Error ? error.message : String(error)}`); }
  try { return JSON.parse(bytes.toString('utf8')) as unknown; }
  catch { throw new Error(`REFERENCE_LOCALE_BINDING_STALE: ${label} is not JSON`); }
}

function parseEvidence(value: unknown): ReferenceLocaleBindingEvidence {
  const root = record(value, 'evidence');
  exact(root, ['schema', 'boardSha256', 'localeContextSha256', 'culturalProfileSha256', 'culturalProjectionSha256', 'bindings'], 'evidence');
  if (root.schema !== REFERENCE_LOCALE_BINDING_EVIDENCE_SCHEMA || !Array.isArray(root.bindings) || root.bindings.length === 0) {
    return fail(`evidence must use ${REFERENCE_LOCALE_BINDING_EVIDENCE_SCHEMA} with bindings`);
  }
  const bindings = root.bindings.map((entry, index) => {
    const item = record(entry, `evidence.bindings[${index}]`);
    exact(item, ['candidateId', 'slotId', 'localeDecisionId', 'sourceLane', 'disposition', 'sourceId', 'sourceCaptureSha256'], `evidence.bindings[${index}]`);
    if (!['native-category', 'global-equivalent', 'counterexample'].includes(String(item.sourceLane))) return fail(`evidence.bindings[${index}].sourceLane is invalid`);
    if (item.disposition !== 'positive' && item.disposition !== 'anti-reference') return fail(`evidence.bindings[${index}].disposition is invalid`);
    return Object.freeze({
      candidateId: id(item.candidateId, `evidence.bindings[${index}].candidateId`),
      slotId: id(item.slotId, `evidence.bindings[${index}].slotId`),
      localeDecisionId: id(item.localeDecisionId, `evidence.bindings[${index}].localeDecisionId`),
      sourceLane: item.sourceLane as 'native-category' | 'global-equivalent' | 'counterexample',
      disposition: item.disposition as 'positive' | 'anti-reference',
      sourceId: id(item.sourceId, `evidence.bindings[${index}].sourceId`),
      sourceCaptureSha256: digest(item.sourceCaptureSha256, `evidence.bindings[${index}].sourceCaptureSha256`),
    });
  });
  return Object.freeze({
    schema: REFERENCE_LOCALE_BINDING_EVIDENCE_SCHEMA,
    boardSha256: digest(root.boardSha256, 'evidence.boardSha256'),
    localeContextSha256: digest(root.localeContextSha256, 'evidence.localeContextSha256'),
    culturalProfileSha256: digest(root.culturalProfileSha256, 'evidence.culturalProfileSha256'),
    culturalProjectionSha256: digest(root.culturalProjectionSha256, 'evidence.culturalProjectionSha256'),
    bindings: Object.freeze(bindings),
  });
}

export function validateReferenceLocaleBindingCurrentness(root: string): ReferenceLocaleBindingBundle {
  const savedProjection = jsonFile(root, REFERENCE_LOCALE_BINDING_PATH, 'reference locale binding projection');
  const savedEvidence = parseEvidence(jsonFile(root, REFERENCE_LOCALE_BINDING_EVIDENCE_PATH, 'reference locale binding evidence'));
  const rebuilt = buildReferenceLocaleBinding(root, {
    bindings: savedEvidence.bindings.map(({ candidateId, slotId, localeDecisionId }) => ({ candidateId, slotId, localeDecisionId })),
  });
  if (canonicalJson(savedProjection) !== canonicalJson(rebuilt.projection)
    || canonicalJson(savedEvidence) !== canonicalJson(rebuilt.evidence)) {
    throw new Error('REFERENCE_LOCALE_BINDING_STALE: saved binding does not match current board, profile, projection, sources, or context');
  }
  return rebuilt;
}

export function referenceLocaleBindingSha256(binding: ReferenceLocaleBinding): string {
  return createHash('sha256').update(canonicalJson(binding)).digest('hex');
}
