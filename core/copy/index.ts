import { createHash } from 'node:crypto';
import { NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256 } from '../art-direction/decision.ts';

export const COPY_REQUIRED_SECTIONS = [
  'Sources and fact ledger',
  'Audience language',
  'Voice contract',
  'Surface copy',
  'Navigation and actions',
  'States and recovery',
  'Humanize audit',
] as const;

export type InteractionScope = 'stateful' | 'navigation-only' | 'static';
export type ArtDirectionRegister = 'quiet' | 'confident' | 'showpiece';
export type MotionDecision = 'none' | 'one';

export interface CopyViolation {
  id: string;
  path: '.omd/copy-deck.md';
  message: string;
}
export interface RenderedBeat {
  id: string;
  boundary: boolean;
  distinctRegions: number;
  ancestorBeatIds: string[];
  rendered: true;
  observedViewport: { width: number; height: number };
}

/** Canonical dual-viewport Beat receipt emitted by `captureRenderedBeatReceipt`. */
export interface RenderedBeatProof {
  schema: 'rendered-beat-receipt-v1';
  artDirectionHash: string;
  copyDeckSha256: string;
  beatIds: readonly string[];
  renderedBeats: unknown;
  captureViewports: unknown;
}
type CapturedViewport = { width?: unknown; height?: unknown };

export interface SelectedArtDirectionContract {
  readonly selectedRegister: ArtDirectionRegister;
  readonly motionDecision: MotionDecision;
  readonly beatIds: readonly string[];
  /** Producer-populated immutable intent-ledger receipt from ArtDirectionDecision. */
  readonly currentUserBeatExceptionReceiptSha256: string;
}
export const COPY_DECK_RECEIPT_SCHEMA_VERSION = 'copy-deck-receipt-v1' as const;

export interface CanonicalCopyDeckReceipt {
  schemaVersion: typeof COPY_DECK_RECEIPT_SCHEMA_VERSION;
  copyDeckSha256: string;
  artDirectionSha256: string;
  selectedRegister: ArtDirectionRegister;
  motionDecision: MotionDecision;
  beatIds: readonly string[];
  currentUserBeatExceptionReceiptSha256: string;
}

export interface CopyReviewViolation {
  id: 'COPY-REVIEW-MISSING' | 'COPY-REVIEW-MODE' | 'COPY-REVIEW-TIME'
    | 'COPY-REVIEW-HASH' | 'COPY-REVIEW-VERDICT' | 'COPY-REVIEW-FINDINGS';
  path: '.omd/.cache/copy-eye.md';
  message: string;
}

interface Fact {
  id: string;
  status: 'verified' | 'fixture' | 'open';
  source: string;
}

const issue = (id: string, message: string): CopyViolation => ({
  id,
  path: '.omd/copy-deck.md',
  message,
});

const reviewIssue = (id: CopyReviewViolation['id'], message: string): CopyReviewViolation => ({
  id,
  path: '.omd/.cache/copy-eye.md',
  message,
});

function exactReviewFieldValues(md: string, label: string): string[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...md.matchAll(new RegExp(`^${escaped}:[ \\t]*(.*?)[ \\t]*$`, 'gm'))]
    .map((match) => match[1]?.trim() ?? '');
}

/** Validate only the preserved copy-eye report structure; never infer blindness or semantic quality. */
export function validateCopyReviewReport(md: string): CopyReviewViolation[] {
  if (!md.trim()) {
    return [reviewIssue('COPY-REVIEW-MISSING', 'Copy-eye report is missing or empty.')];
  }

  const violations: CopyReviewViolation[] = [];
  const modes = exactReviewFieldValues(md, 'Mode');
  if (modes.length !== 1 || modes[0] !== 'copy-editor') {
    violations.push(reviewIssue('COPY-REVIEW-MODE', 'Report must contain exactly one `Mode: copy-editor` line.'));
  }

  const times = exactReviewFieldValues(md, 'Review time');
  const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (times.length !== 1 || !isoTime.test(times[0] ?? '') || Number.isNaN(Date.parse(times[0] ?? ''))) {
    violations.push(reviewIssue('COPY-REVIEW-TIME', 'Report must contain exactly one valid ISO `Review time` line.'));
  }

  const hashes = exactReviewFieldValues(md, 'Reviewed copy-deck SHA-256');
  if (hashes.length !== 1 || !/^[0-9a-f]{64}$/.test(hashes[0] ?? '')) {
    violations.push(reviewIssue('COPY-REVIEW-HASH', 'Report must contain exactly one reviewed copy-deck SHA-256 using 64 lowercase hex characters.'));
  }

  const verdicts = exactReviewFieldValues(md, 'Verdict');
  if (verdicts.length !== 1 || !verdicts[0] || /^(?:TODO|TBD|N\/A)$/i.test(verdicts[0])) {
    violations.push(reviewIssue('COPY-REVIEW-VERDICT', 'Report must contain exactly one non-empty `Verdict` line.'));
  }

  const findings = [...md.matchAll(/^Findings:[ \t]*(.*?)[ \t]*$/gm)];
  if (findings.length !== 1) {
    violations.push(reviewIssue('COPY-REVIEW-FINDINGS', 'Report must contain exactly one non-empty `Findings` section.'));
  } else {
    const match = findings[0]!;
    const inline = match[1]?.trim() ?? '';
    const afterHeader = md.slice((match.index ?? 0) + match[0].length)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^[#*_`>|-]+\s*/gm, '')
      .trim();
    if (!(inline || afterHeader)) {
      violations.push(reviewIssue('COPY-REVIEW-FINDINGS', 'Report must contain exactly one non-empty `Findings` section.'));
    }
  }

  return violations;
}

export function parseCopySections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const chunk of md.split(/^##\s+/m).slice(1)) {
    const newline = chunk.indexOf('\n');
    const heading = (newline === -1 ? chunk : chunk.slice(0, newline)).trim().toLowerCase();
    if (heading) sections.set(heading, newline === -1 ? '' : chunk.slice(newline + 1));
  }
  return sections;
}

const hasContent = (body: string): boolean => body
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/[#*_`>|-]/g, '')
  .trim().length > 0;

function fieldValues(body: string, label: string): string[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = body.matchAll(new RegExp(`^\\s*[-*]?\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`, 'gim'));
  return [...matches].map((match) => match[1]?.trim() ?? '');
}

const field = (body: string, label: string): string | null => fieldValues(body, label)[0] ?? null;

const hasNaReason = (value: string | null): boolean => value !== null
  && /^N\/A\s*(?:—|-|:)\s*\S.+$/i.test(value);

function parseFacts(body: string, violations: CopyViolation[]): Map<string, Fact> {
  const facts = new Map<string, Fact>();
  const rows = body.split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const header = rows.findIndex((cells) => cells.map((cell) => cell.toLowerCase()).includes('id'));
  if (header === -1) {
    violations.push(issue('COPY-FACT-LEDGER', 'Fact ledger must use ID, Status, Source, and Fact columns.'));
    return facts;
  }
  const columns = rows[header]!.map((cell) => cell.toLowerCase());
  const idIndex = columns.indexOf('id');
  const statusIndex = columns.indexOf('status');
  const sourceIndex = columns.indexOf('source');
  const factIndex = columns.indexOf('fact');
  if ([idIndex, statusIndex, sourceIndex, factIndex].some((index) => index === -1)) {
    violations.push(issue('COPY-FACT-LEDGER', 'Fact ledger must use ID, Status, Source, and Fact columns.'));
    return facts;
  }
  for (const cells of rows.slice(header + 1)) {
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const id = cells[idIndex] ?? '';
    const status = (cells[statusIndex] ?? '').toLowerCase();
    const source = cells[sourceIndex] ?? '';
    const factText = cells[factIndex] ?? '';
    if (!id && !status && !source && !factText) continue;
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(id) || !['verified', 'fixture', 'open'].includes(status) || !source || /^(?:N\/A|none)$/i.test(source) || !factText) {
      violations.push(issue('COPY-FACT-LEDGER', `Invalid fact row "${id || '(missing ID)'}"; require ID, verified|fixture|open status, source, and fact.`));
      continue;
    }
    if (facts.has(id)) {
      violations.push(issue('COPY-FACT-LEDGER', `Duplicate fact ID: ${id}.`));
      continue;
    }
    facts.set(id, { id, status: status as Fact['status'], source });
  }
  if (facts.size === 0) violations.push(issue('COPY-FACT-LEDGER', 'Fact ledger must contain at least one explicit fact row.'));
  return facts;
}

interface SurfaceBlock {
  name: string;
  body: string;
}

function parseSurfaceBlocks(body: string): SurfaceBlock[] {
  return body.split(/^###\s+/m).slice(1).flatMap((chunk) => {
    const newline = chunk.indexOf('\n');
    const name = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
    return name ? [{ name, body: newline === -1 ? '' : chunk.slice(newline + 1) }] : [];
  });
}

function validateSurfaceCopy(body: string, facts: Map<string, Fact>, violations: CopyViolation[]): void {
  const surfaces = parseSurfaceBlocks(body);
  if (surfaces.length === 0) {
    violations.push(issue('COPY-SURFACE', 'Surface copy must contain at least one H3 surface block.'));
    return;
  }

  for (const surface of surfaces) {
    for (const label of ['Main message', 'Supporting fact', 'Next action', 'Claim refs']) {
      const values = fieldValues(surface.body, label);
      if (values.length !== 1) {
        violations.push(issue('COPY-SURFACE', `Surface "${surface.name}" must declare exactly one ${label} field.`));
      }
    }

    const refs = fieldValues(surface.body, 'Claim refs');
    if (refs.length !== 1) continue;
    const value = refs[0]!;
    if (/^none$/i.test(value)) continue;
    if (!/^[A-Z][A-Z0-9]*-\d+(?:\s*,\s*[A-Z][A-Z0-9]*-\d+)*$/.test(value)) {
      violations.push(issue('COPY-CLAIM-REF', `Surface "${surface.name}" has invalid Claim refs: ${value}. Use none or a comma-separated fact ID list.`));
      continue;
    }
    const ids = value.split(',').map((id) => id.trim());
    for (const id of ids) {
      const fact = facts.get(id);
      if (!fact) violations.push(issue('COPY-CLAIM-REF', `Surface "${surface.name}" references unknown fact ID ${id}.`));
      else if (fact.status !== 'verified') {
        violations.push(issue('COPY-CLAIM-REF', `Surface "${surface.name}" may reference only verified facts; ${id} is ${fact.status}.`));
      }
    }
  }
}

function validateVoiceContract(body: string, violations: CopyViolation[]): void {
  for (const label of ['Audience', 'Language', 'Register']) {
    if (fieldValues(body, label).length !== 1) {
      violations.push(issue('COPY-VOICE-CONTRACT', `Voice contract must declare exactly one ${label} field.`));
    }
  }
}

function validateInteraction(body: string, violations: CopyViolation[]): void {
  const scopeValues = fieldValues(body, 'Interaction scope');
  if (scopeValues.length !== 1) {
    violations.push(issue('COPY-INTERACTION-SCOPE', 'States and recovery must declare exactly one Interaction scope field.'));
  }
  for (const label of ['Primary copy', 'Recovery copy', 'Primary probe', 'Recovery probe']) {
    if (fieldValues(body, label).length !== 1) {
      violations.push(issue('COPY-STATE-CONTRACT', `States and recovery must declare exactly one ${label} field.`));
    }
  }

  const scopeValue = scopeValues[0] ?? null;
  const scope = scopeValue as InteractionScope | null;
  if (scopeValues.length !== 1 || !scope || !['stateful', 'navigation-only', 'static'].includes(scope)) {
    if (scopeValues.length === 1) {
      violations.push(issue('COPY-INTERACTION-SCOPE', 'Interaction scope must be exactly stateful, navigation-only, or static.'));
    }
    return;
  }

  const primaryCopy = field(body, 'Primary copy');
  const recoveryCopy = field(body, 'Recovery copy');
  const primaryProbe = field(body, 'Primary probe');
  const recoveryProbe = field(body, 'Recovery probe');
  if (!primaryCopy || /^N\/A\b/i.test(primaryCopy)) {
    violations.push(issue('COPY-STATE-CONTRACT', 'Primary copy is required for every interaction scope.'));
  }

  if (scope === 'stateful') {
    for (const [label, value] of [['Recovery copy', recoveryCopy], ['Primary probe', primaryProbe], ['Recovery probe', recoveryProbe]] as const) {
      if (!value || /^N\/A\b/i.test(value)) violations.push(issue('COPY-STATE-CONTRACT', `${label} is required for stateful surfaces.`));
    }
    return;
  }

  if (scope === 'navigation-only') {
    if (!primaryProbe || /^N\/A\b/i.test(primaryProbe)) {
      violations.push(issue('COPY-STATE-CONTRACT', 'Primary probe is required for navigation-only surfaces.'));
    }
    for (const [label, value] of [['Recovery copy', recoveryCopy], ['Recovery probe', recoveryProbe]] as const) {
      if (!hasNaReason(value)) violations.push(issue('COPY-STATE-CONTRACT', `${label} must be N/A with an explicit reason for navigation-only surfaces.`));
    }
    return;
  }

  for (const [label, value] of [['Recovery copy', recoveryCopy], ['Primary probe', primaryProbe], ['Recovery probe', recoveryProbe]] as const) {
    if (!hasNaReason(value)) violations.push(issue('COPY-STATE-CONTRACT', `${label} must be N/A with an explicit reason for static surfaces.`));
  }
}

function parseFactIds(value: string): string[] | null {
  if (!/^[A-Z][A-Z0-9]*-\d+(?:\s*,\s*[A-Z][A-Z0-9]*-\d+)*$/.test(value)) return null;
  return value.split(',').map((id) => id.trim());
}

function validateVerifiedFactIds(
  value: string,
  label: string,
  facts: Map<string, Fact>,
  violations: CopyViolation[],
): void {
  const ids = parseFactIds(value);
  if (!ids) {
    violations.push(issue('COPY-ART-DIRECTION-EVIDENCE', `${label} must be a comma-separated verified fact ID list.`));
    return;
  }
  for (const id of ids) {
    const fact = facts.get(id);
    if (!fact) violations.push(issue('COPY-ART-DIRECTION-EVIDENCE', `${label} references unknown fact ID ${id}.`));
    else if (fact.status !== 'verified') {
      violations.push(issue('COPY-ART-DIRECTION-EVIDENCE', `${label} may reference only verified facts; ${id} is ${fact.status}.`));
    }
  }
}

function validateArtDirection(body: string, facts: Map<string, Fact>, violations: CopyViolation[]): void {
  const schema = fieldValues(body, 'Schema');
  if (schema.length !== 1 || schema[0] !== 'art-direction-v1') {
    violations.push(issue('COPY-ART-DIRECTION-SCHEMA', 'Art direction contract must declare exactly one `Schema: art-direction-v1` field.'));
  }

  const registers = fieldValues(body, 'Register');
  const register = registers[0] as ArtDirectionRegister | undefined;
  if (registers.length !== 1 || !register || !['quiet', 'confident', 'showpiece'].includes(register)) {
    violations.push(issue('COPY-ART-DIRECTION-REGISTER', 'Art direction contract Register must be exactly quiet, confident, or showpiece.'));
  }

  const decisions = fieldValues(body, 'motionDecision');
  if (decisions.length !== 1 || !['none', 'one'].includes(decisions[0] ?? '')) {
    violations.push(issue('COPY-ART-DIRECTION-MOTION', 'Art direction contract motionDecision must be exactly none or one.'));
  }

  const evidence = fieldValues(body, 'Evidence IDs');
  if (evidence.length !== 1) {
    violations.push(issue('COPY-ART-DIRECTION-EVIDENCE', 'Art direction contract must declare exactly one Evidence IDs field.'));
  } else {
    validateVerifiedFactIds(evidence[0]!, 'Evidence IDs', facts, violations);
  }

  const exception = fieldValues(body, 'Current-user exception');
  const receipts = fieldValues(body, 'Current-user Beat-exception receipt SHA-256');
  const noException = exception.length === 1 && exception[0] === 'N/A — no host-authorized Beat exception';
  const positiveException = exception.length === 1 && /^current-user:\s*host-authorized Beat exception$/i.test(exception[0] ?? '');
  if (!noException && !positiveException) {
    violations.push(issue('COPY-ART-DIRECTION-EXCEPTION', 'Art direction contract must declare either `N/A — no host-authorized Beat exception` or `current-user: host-authorized Beat exception`.'));
  }
  if (receipts.length !== 1 || !/^[a-f0-9]{64}$/.test(receipts[0] ?? '')
    || (noException && receipts[0] !== NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256)) {
    violations.push(issue('COPY-ART-DIRECTION-EXCEPTION', 'Art direction contract must bind the canonical no-exception receipt or one exact typed current-user Beat-exception receipt.'));
  }

  const rows = body.split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const headerIndex = rows.findIndex((cells) => cells.includes('Beat ID') && cells.includes('Evidence IDs'));
  if (headerIndex === -1) {
    violations.push(issue('COPY-ART-DIRECTION-BEATS', 'Art direction contract must include a Beat ID and Evidence IDs table.'));
    return;
  }

  const header = rows[headerIndex]!;
  const beatIndex = header.indexOf('Beat ID');
  const evidenceIndex = header.indexOf('Evidence IDs');
  const beatIds = new Set<string>();
  let beatCount = 0;
  for (const cells of rows.slice(headerIndex + 1)) {
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const beatId = cells[beatIndex] ?? '';
    const beatEvidence = cells[evidenceIndex] ?? '';
    if (!beatId && !beatEvidence) continue;
    beatCount += 1;
    if (!/^B-\d+$/.test(beatId) || beatIds.has(beatId)) {
      violations.push(issue('COPY-ART-DIRECTION-BEATS', `Beat ID "${beatId || '(missing)'}" must be unique and use B-<number>.`));
    }
    beatIds.add(beatId);
    validateVerifiedFactIds(beatEvidence, `Beat ${beatId || '(missing)'} Evidence IDs`, facts, violations);
  }

  if (beatCount === 0) violations.push(issue('COPY-ART-DIRECTION-BEATS', 'Art direction contract must contain at least one evidence-backed beat.'));
}

/** Validate only explicit copy-deck structure and traceability; never score writing style. */
export function validateCopyDeck(md: string): CopyViolation[] {
  const violations: CopyViolation[] = [];
  if (!md.trim()) return [issue('COPY-MISSING', 'Copy deck is missing or empty.')];

  const sections = parseCopySections(md);
  for (const required of COPY_REQUIRED_SECTIONS) {
    const body = sections.get(required.toLowerCase());
    if (body === undefined) violations.push(issue('COPY-SECTION', `Missing required section: ${required}.`));
    else if (!hasContent(body)) violations.push(issue('COPY-SECTION', `Required section is empty: ${required}.`));
  }

  const placeholders = [
    /lorem ipsum/i,
    /<!--\s*(?:TODO|TBD|PLACEHOLDER|OPEN QUESTION)\s*-->/i,
    /(?:^|\n)\s*(?:(?:[-*]|#{1,6})\s*)?(?:TODO|TBD|\[(?:TODO|TBD|PLACEHOLDER|OPEN QUESTION)\])\s*(?=\n|$)/i,
    /(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?[^:\n]+?(?:\*\*)?\s*:\s*(?:TODO|TBD|\[(?:TODO|TBD|PLACEHOLDER|OPEN QUESTION)\])\s*(?=\n|$)/i,
    /(?:^|\n)\s*[-*]?\s*(?:\*\*)?Open question(?:\*\*)?\s*:/i,
  ];
  if (placeholders.some((pattern) => pattern.test(md))) {
    violations.push(issue('COPY-PLACEHOLDER', 'Resolve exact TODO/TBD/lorem/placeholder/open-question sentinels before build.'));
  }

  const factBody = sections.get('sources and fact ledger') ?? '';
  const facts = parseFacts(factBody, violations);
  validateVoiceContract(sections.get('voice contract') ?? '', violations);
  validateSurfaceCopy(sections.get('surface copy') ?? '', facts, violations);
  validateInteraction(sections.get('states and recovery') ?? '', violations);
  return violations;
}

function copyBeatIds(artDirection: string): Set<string> {
  const rows = artDirection.split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const headerIndex = rows.findIndex((cells) => cells.includes('Beat ID') && cells.includes('Evidence IDs'));
  if (headerIndex === -1) return new Set();
  const beatIndex = rows[headerIndex]!.indexOf('Beat ID');
  return new Set(rows.slice(headerIndex + 1)
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map((cells) => cells[beatIndex] ?? '')
    .filter((id) => /^B-\d+$/.test(id)));
}

function renderedBeatEntries(proof: RenderedBeatProof): RenderedBeat[] | null {
  const candidate = proof.renderedBeats;
  if (!Array.isArray(candidate)) return null;
  const entries: RenderedBeat[] = [];
  for (const value of candidate) {
    if (!value || typeof value !== 'object') return null;
    const beat = value as Partial<RenderedBeat>;
    if (
      typeof beat.id !== 'string'
      || typeof beat.boundary !== 'boolean'
      || typeof beat.distinctRegions !== 'number'
      || !Array.isArray(beat.ancestorBeatIds)
      || !beat.ancestorBeatIds.every((id) => typeof id === 'string')
      || beat.rendered !== true
      || !beat.observedViewport
      || !Number.isInteger(beat.observedViewport.width)
      || !Number.isInteger(beat.observedViewport.height)
      || beat.observedViewport.width <= 0
      || beat.observedViewport.height <= 0
    ) return null;
    entries.push(beat as RenderedBeat);
  }
  return entries;
}

function observedViewportKey(beat: RenderedBeat): string {
  return `${beat.observedViewport.width}x${beat.observedViewport.height}`;
}

function responsiveDuplicatesAreExclusive(beats: RenderedBeat[]): boolean {
  const viewportCounts = new Map<string, number>();
  for (const beat of beats) {
    const key = observedViewportKey(beat);
    viewportCounts.set(key, (viewportCounts.get(key) ?? 0) + 1);
  }
  return viewportCounts.size === 2
    && viewportCounts.get('1280x900') === 1
    && viewportCounts.get('390x844') === 1;
}

/** Strict post-render validation: one host-observed Beat receipt must prove every declared Beat at both fixed harness viewports. */
export function validatePostRenderBeatProof(md: string, proof: RenderedBeatProof, selected?: Pick<SelectedArtDirectionContract, 'beatIds'>): CopyViolation[] {
  const sections = parseCopySections(md);
  const expected = new Set(selected?.beatIds ?? copyBeatIds(sections.get('art direction contract') ?? ''));
  const beats = renderedBeatEntries(proof);
  if (proof.schema !== 'rendered-beat-receipt-v1' || !/^[a-f0-9]{64}$/.test(proof.artDirectionHash)
    || !/^[a-f0-9]{64}$/.test(proof.copyDeckSha256) || !Array.isArray(proof.beatIds)
    || proof.beatIds.some((id) => typeof id !== 'string' || !/^B-\d+$/.test(id))
    || new Set(proof.beatIds).size !== proof.beatIds.length) {
    return [issue('COPY-RENDERED-BEAT-PROOF', 'Rendered Beat proof must be one canonical host receipt bound to copy and art-direction lineage.')];
  }
  const receiptBeatIds = new Set(proof.beatIds);
  if (receiptBeatIds.size !== expected.size || [...receiptBeatIds].some((id) => !expected.has(id))) {
    return [issue('COPY-RENDERED-BEAT-EXPECTED', 'Rendered Beat receipt IDs must exactly match the selected art direction.')];
  }
  if (!beats) return [issue('COPY-RENDERED-BEAT-PROOF', 'Rendered Beat proof must contain a renderedBeats array from DOM extraction.')];
  const viewportProof = proof.captureViewports;
  const fixedViewports = new Set(['1280x900', '390x844']);
  if (!Array.isArray(viewportProof) || viewportProof.length !== 2 || new Set(viewportProof.map((viewport) =>
    viewport && typeof viewport === 'object' && Number.isInteger((viewport as CapturedViewport).width) && Number.isInteger((viewport as CapturedViewport).height)
      ? `${(viewport as CapturedViewport).width}x${(viewport as CapturedViewport).height}` : '')).size !== 2
    || !(viewportProof as unknown[]).every((viewport) => fixedViewports.has(`${(viewport as CapturedViewport).width}x${(viewport as CapturedViewport).height}`))) {
    return [issue('COPY-RENDERED-BEAT-VIEWPORTS', 'Post-render Beat proof must bind exactly the fixed 1280x900 and 390x844 captures.')];
  }
  if (expected.size === 0) return [issue('COPY-RENDERED-BEAT-EXPECTED', 'Selected art direction must contain immutable Beat IDs before rendering.')];

  const violations: CopyViolation[] = [];
  const byId = new Map<string, RenderedBeat[]>();
  for (const beat of beats) {
    if (!/^B-\d+$/.test(beat.id)) {
      violations.push(issue('COPY-RENDERED-BEAT-ID', `Rendered Beat ID "${beat.id || '(missing)'}" must use B-<number>.`));
      continue;
    }
    const sameId = byId.get(beat.id) ?? [];
    sameId.push(beat);
    byId.set(beat.id, sameId);
    if (!fixedViewports.has(observedViewportKey(beat))) {
      violations.push(issue('COPY-RENDERED-BEAT-VIEWPORT', `Rendered Beat ${beat.id} was observed outside a fixed harness viewport.`));
    }
    if (!beat.boundary || beat.distinctRegions !== 0 || beat.ancestorBeatIds.length !== 0) {
      violations.push(issue('COPY-RENDERED-BEAT-SEGMENT', `Rendered Beat ${beat.id} must be one visible, non-nested visual region with no merged Beat descendants.`));
    }
  }
  for (const id of expected) {
    const matches = byId.get(id) ?? [];
    for (const viewport of fixedViewports) {
      const count = matches.filter((beat) => observedViewportKey(beat) === viewport).length;
      if (count === 0) violations.push(issue('COPY-RENDERED-BEAT-MISSING', `Copy-deck Beat ${id} is absent at ${viewport}.`));
      else if (count !== 1) violations.push(issue('COPY-RENDERED-BEAT-DUPLICATE', `Rendered Beat ${id} must have exactly one visible responsive-exclusive region at ${viewport}.`));
    }
    if (matches.length > 0 && !responsiveDuplicatesAreExclusive(matches)) {
      violations.push(issue('COPY-RENDERED-BEAT-RESPONSIVE', `Rendered Beat ${id} must be represented exactly once at each fixed viewport.`));
    }
  }
  for (const id of byId.keys()) {
    if (!expected.has(id)) violations.push(issue('COPY-RENDERED-BEAT-EXTRA', `Rendered [data-omd-beat] ID ${id} is not declared by the copy deck.`));
  }
  return violations;
}
/** Backward-compatible alias for callers that already run the post-render phase. */
export const validateRenderedBeatProof = validatePostRenderBeatProof;

/** Pre-render copy validation; DOM Beat proof is intentionally a separate post-render phase. */
export function validateCopyDeckV2(md: string, renderedProof?: RenderedBeatProof): CopyViolation[] {
  const violations = validateCopyDeck(md);
  if (!md.trim()) return violations;
  if ((md.match(/^# Copy[ \t]*$/gm) ?? []).length !== 1 || !md.startsWith('# Copy')) {
    violations.push(issue('COPY-TITLE', 'CopyDeckV2 must begin with exactly one `# Copy` title.'));
  }

  const sections = parseCopySections(md);
  const artDirection = sections.get('art direction contract');
  if (artDirection === undefined) {
    violations.push(issue('COPY-SECTION', 'Missing required v2 section: Art direction contract.'));
  } else if (!hasContent(artDirection)) {
    violations.push(issue('COPY-SECTION', 'Required v2 section is empty: Art direction contract.'));
  }

  const facts = parseFacts(sections.get('sources and fact ledger') ?? '', []);
  validateArtDirection(artDirection ?? '', facts, violations);
  if (renderedProof !== undefined) violations.push(...validatePostRenderBeatProof(md, renderedProof));
  return violations;
}
export function validateCopyDeckV2AgainstSelectedArtDirection(
  md: string,
  selected: SelectedArtDirectionContract,
): CopyViolation[] {
  const sections = parseCopySections(md);
  const artDirection = sections.get('art direction contract') ?? '';
  const violations: CopyViolation[] = [];
  const exceptionReceipt = selected.currentUserBeatExceptionReceiptSha256;
  const hasBeatException = exceptionReceipt !== NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256;
  if (!/^[a-f0-9]{64}$/.test(exceptionReceipt)) {
    violations.push(issue('COPY-ART-DIRECTION-BEAT-EXCEPTION', 'Selected art direction must provide either the canonical no-exception marker or a content-addressed host-authorized Beat-exception receipt.'));
  }
  const registers = fieldValues(artDirection, 'Register');
  if (registers.length !== 1 || registers[0] !== selected.selectedRegister) {
    violations.push(issue('COPY-ART-DIRECTION-SELECTION', `Copy deck Register must match selected art-direction register ${selected.selectedRegister}.`));
  }
  const motionDecisions = fieldValues(artDirection, 'motionDecision');
  if (motionDecisions.length !== 1 || motionDecisions[0] !== selected.motionDecision) {
    violations.push(issue('COPY-ART-DIRECTION-MOTION-SELECTION', `Copy deck motionDecision must match immutable selected art-direction motionDecision ${selected.motionDecision}.`));
  }
  const receipts = fieldValues(artDirection, 'Current-user Beat-exception receipt SHA-256');
  if (receipts.length !== 1 || receipts[0] !== exceptionReceipt) {
    violations.push(issue('COPY-ART-DIRECTION-BEAT-EXCEPTION', 'Copy deck must bind the exact selected Beat-exception receipt or canonical no-exception marker.'));
  }
  const declaredException = fieldValues(artDirection, 'Current-user exception');
  const expectedException = hasBeatException ? /^current-user:\s*host-authorized Beat exception$/i : 'N/A — no host-authorized Beat exception';
  if (declaredException.length !== 1 || (typeof expectedException === 'string'
    ? declaredException[0] !== expectedException
    : !expectedException.test(declaredException[0] ?? ''))) {
    violations.push(issue('COPY-ART-DIRECTION-BEAT-EXCEPTION', hasBeatException
      ? 'An over-budget deck must declare only `current-user: host-authorized Beat exception` and bind its exact receipt.'
      : 'A no-exception decision must explicitly declare `N/A — no host-authorized Beat exception`.'));
  }
  const beatIds = [...copyBeatIds(artDirection)].sort();
  const expected = [...selected.beatIds].sort();
  if (beatIds.length !== expected.length || beatIds.some((id, index) => id !== expected[index])) {
    violations.push(issue('COPY-ART-DIRECTION-BEAT-STABILITY', 'Copy-deck Beat IDs must exactly match the selected art-direction record.'));
  }
  const budget = selected.selectedRegister === 'quiet' ? 5 : 7;
  if (beatIds.length > budget && !hasBeatException) {
    violations.push(issue('COPY-ART-DIRECTION-BUDGET', `${selected.selectedRegister} register permits over-budget Beats only with the exact host-authorized receipt.`));
  }
  return violations;
}
export function copyDeckSha256(copyDeckBytes: Uint8Array): string {
  return createHash('sha256').update(copyDeckBytes).digest('hex');
}

const copyText = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** Validates the canonical final-graph copy receipt against its exact source bytes. */
export function validateCanonicalCopyDeckReceipt(
  value: unknown,
  copyDeckBytes: Uint8Array,
  selected: SelectedArtDirectionContract,
): CanonicalCopyDeckReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('copy receipt must be an object');
  const receipt = Object.fromEntries(Object.entries(value));
  const expected = ['artDirectionSha256', 'beatIds', 'copyDeckSha256', 'currentUserBeatExceptionReceiptSha256', 'motionDecision', 'schemaVersion', 'selectedRegister'];
  const keys = Object.keys(receipt).sort();
  const beatIds = receipt.beatIds;
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])
    || receipt.schemaVersion !== COPY_DECK_RECEIPT_SCHEMA_VERSION
    || typeof receipt.copyDeckSha256 !== 'string' || receipt.copyDeckSha256 !== copyDeckSha256(copyDeckBytes)
    || typeof receipt.artDirectionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.artDirectionSha256)
    || receipt.selectedRegister !== selected.selectedRegister || receipt.motionDecision !== selected.motionDecision
    || receipt.currentUserBeatExceptionReceiptSha256 !== selected.currentUserBeatExceptionReceiptSha256
    || !Array.isArray(beatIds) || !beatIds.every((id) => typeof id === 'string' && /^B-\d+$/.test(id))
    || new Set(beatIds).size !== beatIds.length) {
    throw new Error('copy receipt has an invalid shape or does not bind the exact selected copy artifact');
  }
  const md = copyText(copyDeckBytes);
  if (md === null) throw new Error('copy receipt bytes are not valid UTF-8');
  const violations = [
    ...validateCopyDeckV2(md),
    ...validateCopyDeckV2AgainstSelectedArtDirection(md, selected),
  ];
  const receiptBeatIds = [...beatIds].sort();
  const selectedBeatIds = [...selected.beatIds].sort();
  if (receiptBeatIds.length !== selectedBeatIds.length || receiptBeatIds.some((id, index) => id !== selectedBeatIds[index])) {
    throw new Error('copy receipt Beat IDs do not bind selected art direction');
  }
  if (violations.length > 0) throw new Error(`copy receipt binds an invalid CopyDeckV2: ${violations.map((violation) => violation.id).join(', ')}`);
  return {
    schemaVersion: COPY_DECK_RECEIPT_SCHEMA_VERSION,
    copyDeckSha256: receipt.copyDeckSha256,
    artDirectionSha256: receipt.artDirectionSha256,
    selectedRegister: receipt.selectedRegister,
    motionDecision: receipt.motionDecision,
    beatIds,
    currentUserBeatExceptionReceiptSha256: receipt.currentUserBeatExceptionReceiptSha256,
  };
}
