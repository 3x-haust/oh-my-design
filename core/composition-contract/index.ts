import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refIdentity } from '../ref/identity.ts';
import { loadRefs } from '../ref/store.ts';

export const COMPOSITION_SECTIONS = [
  'Input fingerprint', 'Experience spine', 'Section dependency', 'Grid and alignment',
  'Density and visual mass', 'Focal hierarchy', 'Domain form grammar', 'Media roles',
  'Responsive recomposition', 'Candidate axes', 'Transfer boundary',
] as const;

// Allowed-but-optional H2 headings whose row/field schema is owned by another canonical
// validator (task evidence owns `## UX task coverage`). The composition contract only
// recognizes the heading so it can be authored as normal LF Markdown; it never restates
// or revalidates that section's internal schema.
export const AUXILIARY_SECTIONS = ['UX task coverage'] as const;

export interface CompositionContractFinding {
  id: 'COMPOSITION-MISSING' | 'COMPOSITION-SECTION' | 'COMPOSITION-HASH' | 'COMPOSITION-STALE' | 'COMPOSITION-SCOUT' | 'COMPOSITION-SYNTHESIS';
  path: string;
  message: string;
}

export const SYNTHESIS_SECTION = 'Reference synthesis';
export const SYNTHESIS_AXES = [
  'Information architecture/navigation', 'Macro layout and panel/region geometry', 'Content density',
  'Typography/hierarchy', 'Spacing/rhythm', 'Component anatomy', 'Interaction/state/feedback',
  'Responsive/mobile recomposition', 'Motion/transition',
] as const;

const structuralAxes = new Set(SYNTHESIS_AXES.slice(0, 6));
const synthesisPath = `.omd/composition.md#${SYNTHESIS_SECTION}`;
const synthesisFinding = (message: string): CompositionContractFinding => ({ id: 'COMPOSITION-SYNTHESIS', path: synthesisPath, message });
const sectionFinding = (section: string, message: string): CompositionContractFinding => ({ id: 'COMPOSITION-SECTION', path: `.omd/composition.md#${section}`, message });
const normalize = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
const isPlaceholder = (value: string): boolean => /^(?:n\/?a|none|unknown|unspecified|tbd|todo|placeholder|example)(?:\s|$)/i.test(value.trim());
const substantive = (value: string): boolean => value.trim().length >= 8 && !isPlaceholder(value);
const recordName = (kind: string, feature: string): string => `${kind} "${feature}"`;

interface ParsedSections { sections: Map<string, string[]>; findings: CompositionContractFinding[]; }
function parseSections(markdown: string): ParsedSections {
  const sections = new Map<string, string[]>();
  const findings: CompositionContractFinding[] = [];
  const separator = /[\u2028\u2029\u0085\u000B\u000C]/.exec(markdown);
  if (separator) findings.push(sectionFinding('document', `composition must not contain a Unicode line or paragraph separator (found U+${separator[0]!.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}); author headings with normal LF line breaks`));
  let current: string | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const name = heading[1]!;
      if (![...COMPOSITION_SECTIONS, SYNTHESIS_SECTION, ...AUXILIARY_SECTIONS].includes(name as never)) findings.push(sectionFinding(name, `unknown H2 section: ${name}`));
      else if (sections.has(name)) findings.push(sectionFinding(name, `duplicate H2 section: ${name}`));
      else sections.set(name, []);
      current = name;
    } else if (current === undefined) {
      if (line.trim() !== '') findings.push(sectionFinding('document', 'content must appear inside an allowed H2 section'));
    } else {
      sections.get(current)?.push(line);
    }
  }
  return { sections, findings };
}

function validateFingerprint(lines: string[], inputs: CompositionContractInputs): CompositionContractFinding[] {
  const findings: CompositionContractFinding[] = [];
  const values = new Map<string, string>();
  for (const line of lines) {
    if (line.trim() === '') continue;
    const match = /^- (Frame SHA-256|Copy deck SHA-256|Type proof SHA-256|Scout SHA-256): (.+)$/.exec(line);
    if (!match) { findings.push({ id: 'COMPOSITION-HASH', path: '.omd/composition.md#Input fingerprint', message: 'Input fingerprint contains an unknown or malformed line' }); continue; }
    const key = match[1]!;
    if (values.has(key)) findings.push({ id: 'COMPOSITION-HASH', path: '.omd/composition.md#Input fingerprint', message: `${key} must appear exactly once` });
    else values.set(key, match[2]!);
  }
  const required: Array<[string, string, string | undefined]> = [
    ['Frame', 'frame.md', inputs.frame], ['Copy deck', 'copy-deck.md', inputs.copyDeck], ['Type proof', 'type-proof.md', inputs.typeProof],
  ];
  for (const [label, filename, actual] of required) {
    const value = values.get(`${label} SHA-256`);
    if (!value || !/^[0-9a-f]{64}$/.test(value)) findings.push({ id: 'COMPOSITION-HASH', path: '.omd/composition.md#Input fingerprint', message: `${label} SHA-256 must be exactly 64 lowercase hex characters` });
    else if (actual === undefined) findings.push({ id: 'COMPOSITION-STALE', path: `.omd/${filename}`, message: `${filename} is missing; composition cannot be current` });
    else if (value !== actual) findings.push({ id: 'COMPOSITION-STALE', path: `.omd/${filename}`, message: `${filename} changed after composition was written` });
  }
  const scout = values.get('Scout SHA-256');
  if (inputs.scout !== undefined) {
    if (!scout || !/^[0-9a-f]{64}$/.test(scout)) findings.push({ id: 'COMPOSITION-SCOUT', path: '.omd/composition.md#Input fingerprint', message: 'Scout SHA-256 must be a 64-hex hash while .omd/scout.md exists' });
    else if (scout !== inputs.scout) findings.push({ id: 'COMPOSITION-STALE', path: '.omd/scout.md', message: 'scout.md changed after composition was written' });
  } else if (!scout || !/^N\/A — \S.*$/.test(scout)) {
    findings.push({ id: 'COMPOSITION-SCOUT', path: '.omd/composition.md#Input fingerprint', message: 'absent scout.md requires `N/A — <reason>` instead of a hash or empty value' });
  }
  return findings;
}

const featureFields = ['Origin', 'Assumption', 'Primitive', 'Source ref', 'Trust', 'Uncertainty', 'Structural rule', 'Adaptation', 'Token variation', 'Conflict resolution', 'Destination route', 'Destination selector', 'Mobile behavior'] as const;
const declineFields = ['Origin', 'Source ref', 'Trust', 'Uncertainty', 'Reason'] as const;
interface SynthesisResult { findings: CompositionContractFinding[]; sourceRefs: string[]; }

function validRoute(value: string): boolean {
  if (value === '/') return true;
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@\/-]*$/.test(value) || value.startsWith('//')) return false;
  const segments = value.slice(1).split('/');
  return segments.every((segment) => segment !== '.' && segment !== '..') && !isPlaceholder(segments[0] ?? '');
}
function normalizedSelector(value: string): string | undefined {
  const selector = value.trim().replace(/\s+/g, ' ');
  if (/^\[data-[a-z][a-z0-9-]*=(?:"[^"]+"|'[^']+')\]$/.test(selector)) return selector;
  if (/^(?:main|nav|header|footer|aside|form|table|dialog|button|input|select|textarea)(?:\[aria-(?:label|labelledby)=(?:"[^"]+"|'[^']+')\])?$/.test(selector)) return selector;
  if (/^\[role=(?:"(?:main|navigation|dialog|search|form|region)"|'(?:main|navigation|dialog|search|form|region)')\]$/.test(selector)) return selector;
  return undefined;
}

function validateReferenceSynthesis(lines: string[]): SynthesisResult {
  const findings: CompositionContractFinding[] = [];
  const sourceRefs: string[] = [];
  const records: Array<{ kind: 'Feature' | 'Decline'; feature: string; lines: string[] }> = [];
  let current: { kind: 'Feature' | 'Decline'; feature: string; lines: string[] } | undefined;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const heading = /^### (Feature|Decline):\s*(.*?)\s*$/.exec(line);
    if (heading) { current = { kind: heading[1]! as 'Feature' | 'Decline', feature: heading[2]!, lines: [] }; records.push(current); }
    else if (!current) findings.push(synthesisFinding('Reference synthesis may contain only Feature or Decline records'));
    else current.lines.push(line);
  }
  if (records.length === 0) findings.push(synthesisFinding('non-empty Reference synthesis must use ### Feature: or ### Decline: records'));
  const selectors = new Set<string>();
  for (const record of records) {
    const identity = recordName(record.kind, record.feature);
    if (!record.feature.trim() || isPlaceholder(record.feature)) findings.push(synthesisFinding(`${identity}: feature label is missing or a placeholder`));
    const fields = new Map<string, string>();
    const axes: string[][] = [];
    const expected = record.kind === 'Feature' ? featureFields : declineFields;
    let nextField = 0;
    let axisMode = false;
    for (const line of record.lines) {
      if (line === '#### Axes' && record.kind === 'Feature' && !axisMode) {
        if (nextField !== expected.length) findings.push(synthesisFinding(`${identity}: Axes block is misplaced before required fields`));
        axisMode = true;
        continue;
      }
      if (axisMode) {
        const columns = line.startsWith('- ') ? line.slice(2).split(' | ') : [];
        if (columns.length !== 4) findings.push(synthesisFinding(`${identity}: malformed or stray content in Axes block`));
        else axes.push(columns);
        continue;
      }
      const field = /^- ([A-Za-z][A-Za-z ]*): (.*)$/.exec(line);
      if (!field) { findings.push(synthesisFinding(`${identity}: malformed or stray record content`)); continue; }
      const name = field[1]!;
      if (!expected.includes(name as never)) { findings.push(synthesisFinding(`${identity}: unknown or misplaced field "${name}"`)); continue; }
      if (fields.has(name)) findings.push(synthesisFinding(`${identity}: ${name} must appear exactly once`));
      else {
        if (expected[nextField] !== name) findings.push(synthesisFinding(`${identity}: field "${name}" is misplaced`));
        else nextField++;
        fields.set(name, field[2]!);
      }
    }
    for (const name of expected) if (!fields.has(name) || !fields.get(name)!.trim()) findings.push(synthesisFinding(`${identity}: ${name} must appear exactly once with a non-empty value`));
    const origin = fields.get('Origin');
    const source = fields.get('Source ref');
    if (source && !/^(?:ref-[0-9a-f]{16}|[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)$/.test(source)) findings.push(synthesisFinding(`${identity}: Source ref must be a stable ref identity or scout key`));
    else if (source) sourceRefs.push(normalize(source));
    for (const name of ['Trust', 'Uncertainty'] as const) if (fields.has(name) && !substantive(fields.get(name)!)) findings.push(synthesisFinding(`${identity}: ${name} must be substantive`));
    if (record.kind === 'Decline') {
      if (origin !== 'explicit') findings.push(synthesisFinding(`${identity}: a Decline record must use Origin: explicit`));
      if (fields.has('Reason') && !substantive(fields.get('Reason')!)) findings.push(synthesisFinding(`${identity}: Decline Reason must be substantive`));
      continue;
    }
    if (origin !== 'explicit' && origin !== 'inferred') findings.push(synthesisFinding(`${identity}: Origin must be exactly explicit or inferred`));
    const assumption = fields.get('Assumption');
    if (origin === 'explicit' && assumption !== 'N/A') findings.push(synthesisFinding(`${identity}: explicit Origin requires Assumption: N/A`));
    if (origin === 'inferred' && (!assumption || !substantive(assumption))) findings.push(synthesisFinding(`${identity}: inferred Origin requires a substantive Assumption`));
    for (const name of ['Primitive', 'Structural rule', 'Adaptation', 'Token variation', 'Conflict resolution', 'Mobile behavior'] as const) if (fields.has(name) && !substantive(fields.get(name)!)) findings.push(synthesisFinding(`${identity}: ${name} must be substantive`));
    const route = fields.get('Destination route');
    if (route && !validRoute(route)) findings.push(synthesisFinding(`${identity}: Destination route must be a non-placeholder local route beginning with /`));
    const selector = fields.get('Destination selector');
    if (selector) {
      const normalized = normalizedSelector(selector);
      if (!normalized) findings.push(synthesisFinding(`${identity}: Destination selector must be a stable data-* or accessible semantic selector`));
      else if (selectors.has(normalized)) findings.push(synthesisFinding(`${identity}: Destination selector "${normalized}" is duplicated`));
      else selectors.add(normalized);
    }
    if (!axisMode) findings.push(synthesisFinding(`${identity}: every adopted record must contain a #### Axes block`));
    const seen = new Set<string>();
    for (const [axis = '', disposition = '', observed = '', adaptation = ''] of axes) {
      if (!SYNTHESIS_AXES.includes(axis as typeof SYNTHESIS_AXES[number])) { findings.push(synthesisFinding(`${identity}: unknown axis "${axis}"`)); continue; }
      if (seen.has(axis)) findings.push(synthesisFinding(`${identity}: axis "${axis}" must appear exactly once`));
      seen.add(axis);
      if (!['accept', 'adapt', 'decline', 'N/A'].includes(disposition)) findings.push(synthesisFinding(`${identity}: axis "${axis}" has invalid disposition`));
      else if (disposition === 'N/A' ? observed !== 'N/A' || !substantive(adaptation) : !substantive(observed) || !substantive(adaptation)) findings.push(synthesisFinding(`${identity}: axis "${axis}" requires a substantive ${disposition === 'N/A' ? 'N/A reason' : 'observed rule and adaptation or decline rationale'}`));
    }
    for (const axis of SYNTHESIS_AXES) if (!seen.has(axis)) findings.push(synthesisFinding(`${identity}: axis "${axis}" must appear exactly once`));
    if (!axes.some(([axis, disposition]) => structuralAxes.has(axis as typeof SYNTHESIS_AXES[number]) && (disposition === 'accept' || disposition === 'adapt'))) findings.push(synthesisFinding(`${identity}: adopted records cannot be interaction-only or token-only`));
  }
  return { findings, sourceRefs };
}

function sha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

export interface CompositionContractInputs {
  contract?: string; frame?: string; copyDeck?: string; typeProof?: string; scout?: string;
  /** Exact normalized Source ref identities for user-origin refs, not host labels. */
  userRefLabels?: string[];
}

export function validateCompositionContractSource(inputs: CompositionContractInputs): CompositionContractFinding[] {
  if (inputs.contract === undefined) return [{ id: 'COMPOSITION-MISSING', path: '.omd/composition.md', message: 'composition contract is missing' }];
  const parsed = parseSections(inputs.contract);
  const findings = [...parsed.findings];
  for (const section of COMPOSITION_SECTIONS) if (!parsed.sections.get(section)?.join('\n').trim()) findings.push(sectionFinding(section, `required section is missing or empty: ${section}`));
  findings.push(...validateFingerprint(parsed.sections.get('Input fingerprint') ?? [], inputs));
  const synthesisLines = parsed.sections.get(SYNTHESIS_SECTION);
  const synthesis = synthesisLines?.join('\n').trim() ?? '';
  const result = synthesis ? validateReferenceSynthesis(synthesisLines!) : { findings: [], sourceRefs: [] };
  findings.push(...result.findings);
  const userRefs = inputs.userRefLabels ?? [];
  if (userRefs.length > 0 && !synthesis) findings.push(synthesisFinding(`user-provided references exist but the ${SYNTHESIS_SECTION} section is missing or empty`));
  else for (const ref of userRefs) if (!result.sourceRefs.includes(normalize(ref))) findings.push(synthesisFinding(`user reference "${ref}" is not mapped by an exact Source ref field in ${SYNTHESIS_SECTION}`));
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id) || a.message.localeCompare(b.message));
}

export function validateCompositionContract(root: string): CompositionContractFinding[] {
  const omd = join(root, '.omd');
  const readHash = (filename: string): string | undefined => { const path = join(omd, filename); return existsSync(path) ? sha256(path) : undefined; };
  const contractPath = join(omd, 'composition.md');
  const frame = readHash('frame.md'); const copyDeck = readHash('copy-deck.md'); const typeProof = readHash('type-proof.md'); const scout = readHash('scout.md');
  const userRefLabels = loadRefs(root).filter((ref) => ref.origin === 'user').map((ref) => refIdentity(ref.source, ref.component)).sort();
  return validateCompositionContractSource({ ...(existsSync(contractPath) ? { contract: readFileSync(contractPath, 'utf8') } : {}), ...(frame ? { frame } : {}), ...(copyDeck ? { copyDeck } : {}), ...(typeProof ? { typeProof } : {}), ...(scout ? { scout } : {}), ...(userRefLabels.length ? { userRefLabels } : {}) });
}
