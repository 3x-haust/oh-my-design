import { canonicalJson, sha256 } from './board-artifacts.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { parseReferenceApplicationScreens, type ReferenceApplication } from './reference-application.ts';
import { validateDomainBrief } from '../domain/domain-brief.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { verifyBrowseRetention } from './browse/retention.ts';
import { readBrowseBytes } from './browse/trace.ts';
import { refIdentity } from './identity.ts';
import type { Receipt } from './browse/contract.ts';

export const REFERENCE_ANALYSIS_PATH = '.omd/reference-analysis.json';
export const REFERENCE_ANALYSIS_DOC_PATH = '.omd/analysis.md';
export type ReferenceAnalysis = Readonly<{ schema: 'reference-analysis-v1'; sourceContractSha256: string; domainBriefSha256: string;
  references: readonly Readonly<{ referenceId: string; capture: Receipt; image: Receipt;
    screenType: string; mainTask: string; hierarchy: string; density: string; typography: string; components: string }>[];
  selectedReferenceIds: readonly string[];
  patterns: readonly Readonly<{ pattern: string; referenceIds: readonly string[]; decision: 'apply' | 'do-not-apply'; reason: string }>[];
  screens: ReferenceApplication['screens'] }>;
const fail = (message: string): never => { throw new Error(`REFERENCE_ANALYSIS: ${message}`); };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) return fail('closed object required');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 4096) return fail('bounded nonempty observation required'); return value.trim(); }
function list<T>(value: unknown, parse: (item: unknown) => T, maximum = 100): T[] {
  if (!Array.isArray(value) || value.length > maximum || Object.keys(value).length !== value.length) return fail('bounded dense array required');
  return value.map(parse);
}
function digest(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{64}$/.test(result)) return fail('SHA-256 required'); return result; }
function receipt(value: unknown): Receipt {
  const item = object(value, ['path', 'sha256']), path = text(item.path);
  if (!/^\.omd\/refs\/(domain|design)\/[^/]+\.(png|json)$/.test(path)) return fail('whole retained native reference receipt required, not a zoom/detail or diagnostic');
  return { path, sha256: digest(item.sha256) };
}
export function parseReferenceAnalysis(value: unknown): ReferenceAnalysis {
  const input = object(value, ['schema', 'sourceContractSha256', 'domainBriefSha256', 'references', 'selectedReferenceIds', 'patterns', 'screens']);
  if (input.schema !== 'reference-analysis-v1') return fail('unknown schema');
  const references = list(input.references, value => {
    const item = object(value, ['referenceId', 'capture', 'image', 'screenType', 'mainTask', 'hierarchy', 'density', 'typography', 'components']);
    return { referenceId: text(item.referenceId), capture: receipt(item.capture), image: receipt(item.image), screenType: text(item.screenType),
      mainTask: text(item.mainTask), hierarchy: text(item.hierarchy), density: text(item.density), typography: text(item.typography), components: text(item.components) };
  });
  const ids = new Set(references.map(item => item.referenceId)); if (ids.size !== references.length) return fail('duplicate reference id');
  const checkedIds = (value: unknown) => {
    const values = list(value, text);
    if (new Set(values).size !== values.length || values.some(id => !ids.has(id))) return fail('unknown/duplicate reference id'); return values;
  };
  const selectedReferenceIds = checkedIds(input.selectedReferenceIds);
  const patterns = list(input.patterns, value => {
    const item = object(value, ['pattern', 'referenceIds', 'decision', 'reason']), referenceIds = checkedIds(item.referenceIds);
    if (!referenceIds.length || !['apply', 'do-not-apply'].includes(String(item.decision))) return fail('pattern needs observed references and an apply/do-not-apply decision');
    return { pattern: text(item.pattern), referenceIds, decision: item.decision as 'apply' | 'do-not-apply', reason: text(item.reason) };
  });
  const screens = parseReferenceApplicationScreens(input.screens);
  for (const screen of screens) for (const lane of ['domain', 'design'] as const) checkedIds(screen[lane].referenceIds);
  return { schema: 'reference-analysis-v1', sourceContractSha256: digest(input.sourceContractSha256), domainBriefSha256: digest(input.domainBriefSha256), references, selectedReferenceIds, patterns, screens };
}
export function validateReferenceAnalysis(root: string, input: unknown, current: { sourceContractSha256: string; request?: string }) {
  const analysis = parseReferenceAnalysis(input);
  if (analysis.sourceContractSha256 !== current.sourceContractSha256) return fail('source contract changed');
  const bytes = readContainedRegularFile(root, '.omd/domain-brief.json', 'current domain brief');
  if (sha256(bytes) !== analysis.domainBriefSha256) return fail('domain brief changed');
  const domain = validateDomainBrief(JSON.parse(bytes.toString('utf8')));
  if (current.request !== undefined && domain.request !== current.request) return fail('domain brief describes another request');
  const names = domain.surfaces.map(surface => surface.name);
  if (names.length !== analysis.screens.length || names.some(name => !analysis.screens.some(screen => screen.surface === name))) return fail('cover every current surface exactly once');
  const references = analysis.references.map(item => {
    const record: unknown = JSON.parse(readBrowseBytes(root, item.capture).toString('utf8'));
    const verified = verifyBrowseRetention(root, record, { sourceContractSha256: current.sourceContractSha256 });
    if (verified.reference.referenceUnit !== 'whole-screen' || item.referenceId !== refIdentity(verified.reference.source, verified.reference.component)
      || item.image.path !== verified.reference.imagePath || item.image.sha256 !== verified.keep.image.sha256) return fail('reference id/image does not bind a whole-screen native keep');
    return { item, verified };
  });
  for (const screen of analysis.screens) for (const lane of ['domain', 'design'] as const) for (const id of screen[lane].referenceIds) {
    if (!references.some(ref => ref.item.referenceId === id && ref.verified.seal.lane === lane)) return fail('surface reference belongs to the other lane');
  }
  return { analysis, references };
}
function markdown(analysis: ReferenceAnalysis): string {
  const line = (value: string) => value.replace(/[<>]/g, '').replace(/\n/g, ' ');
  return ['# Reference analysis', '', 'Authored after inspecting whole-screen images. This is interpretation, not proof of quality or user approval.', '',
    ...analysis.references.flatMap(item => [`## ${line(item.referenceId)}`, ...(['screenType', 'mainTask', 'hierarchy', 'density', 'typography', 'components'] as const).map(key => `- ${key}: ${line(item[key])}`), '']),
    '## Patterns', ...analysis.patterns.map(item => `- ${line(item.pattern)} [${item.referenceIds.map(line).join(', ')}]: ${item.decision}. ${line(item.reason)}`), '',
    '## Surface coverage', ...analysis.screens.flatMap(screen => [`### ${line(screen.surface)}`, ...(['domain', 'design'] as const).map(lane => `- ${lane}: ${screen[lane].coverage}. Apply: ${line(screen[lane].application)}. Avoid: ${line(screen[lane].doNotTransfer)}. Reason: ${line(screen[lane].reason)}${screen[lane].gap ? `. Gap: ${line(screen[lane].gap!)}` : ''}`), ''])].join('\n');
}
export function publishReferenceAnalysis(root: string, input: unknown, current: { sourceContractSha256: string; request?: string }, writer: ProjectWriteAdapter): ReferenceAnalysis {
  requireProjectWriteAdapter(root, writer); const { analysis } = validateReferenceAnalysis(root, input, current);
  writer.write(REFERENCE_ANALYSIS_DOC_PATH, markdown(analysis));
  writer.write(REFERENCE_ANALYSIS_PATH, `${canonicalJson(analysis)}\n`); return analysis;
}
export function readReferenceAnalysis(root: string, current: { sourceContractSha256: string; request?: string }) {
  const bytes = readContainedRegularFile(root, REFERENCE_ANALYSIS_PATH, 'reference analysis');
  const validated = validateReferenceAnalysis(root, JSON.parse(bytes.toString('utf8')), current);
  if (!readContainedRegularFile(root, REFERENCE_ANALYSIS_DOC_PATH, 'reference analysis document').equals(Buffer.from(markdown(validated.analysis)))
    || !bytes.equals(readContainedRegularFile(root, REFERENCE_ANALYSIS_PATH, 'reference analysis'))) return fail('analysis publication changed or is incomplete');
  return { ...validated, receipt: { path: REFERENCE_ANALYSIS_PATH, sha256: sha256(bytes) } };
}
