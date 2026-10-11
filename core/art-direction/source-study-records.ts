import { PNG } from 'pngjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_STUDY_TASK, SourceStudyContractError, parseSourceStudyPacket } from '../../adapters/pi-study-contract.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { verifySignedPiStudyResult } from '../runtime/pi-study-receipt.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { sourceStudyPackets } from './source-study-packet.ts';

export const SOURCE_STUDY_BASE = '.omd/.cache/studies';
export const SOURCE_STUDY_SET_SCHEMA = 'source-study-set-v2';
export const SOURCE_STUDY_SELECTION_SCHEMA = 'source-study-selection-v1';
export const SOURCE_STUDY_CURRENT = `${SOURCE_STUDY_BASE}/current.json`;
export const SOURCE_STUDY_LATEST = `${SOURCE_STUDY_BASE}/latest.json`;

export type StudyFile = Readonly<{ path: string; sha256: string }>;
export type StudyCapture = StudyFile & Readonly<{
  state: 'initial' | 'primary-work';
  viewport: Readonly<{ name: 'desktop' | 'mobile'; width: number; height: number }>;
}>;
export type ReadSourceStudyVariant = Readonly<{
  id: string; html: StudyFile; renders: readonly StudyCapture[];
  relationship: string; unresolvedConstraints: readonly string[];
}>;
const fail = (reason: string): never => { throw new SourceStudyContractError(reason); };
const exact = (row: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(row).sort().join() !== [...keys].sort().join()) fail('record-fields');
};
function signedRecord(root: string, path: string, schema: string, digest?: string) {
  const bytes = readContainedRegularFile(root, path, 'source study record');
  if (digest !== undefined && sha256(bytes) !== digest) return fail('record-digest');
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  const row = piRecord(value, 'study-record');
  const { signature, ...payload } = row;
  if (payload.schema !== schema || !verifyNativeObservation(root, schema,
    sha256(canonicalJson(payload)), piText(signature, 'study-signature'))) return fail('record-signature');
  return payload;
}
function file(root: string, value: unknown, kind: 'html' | 'renders') {
  const row = piRecord(value, 'study-file');
  const digest = piDigest(row.sha256, 'study-file-sha');
  const path = `${SOURCE_STUDY_BASE}/${kind}/${digest}.${kind === 'html' ? 'html' : 'png'}`;
  const bytes = readContainedRegularFile(root, path, 'source study file');
  if (row.path !== path || sha256(bytes) !== digest) {
    return fail('file-digest');
  }
  return { artifact: { path, sha256: digest }, bytes };
}

export function readSourceStudySet(root: string, invocation: ProjectRunInvocation, digest: string) {
  piDigest(digest, 'study-set-sha');
  const record = signedRecord(root, `${SOURCE_STUDY_BASE}/sets/${digest}.json`, SOURCE_STUDY_SET_SCHEMA, digest);
  exact(record, ['schema', 'contextSha256', 'input', 'variants']);
  const prepared = sourceStudyPackets(root, invocation, record.input);
  if (record.contextSha256 !== prepared.contextSha256 || !Array.isArray(record.variants)
    || record.variants.length !== prepared.packets.length) return fail('set-stale');
  const host = getNativePiRun(invocation, root).host;
  const variants = record.variants.map((value, index): ReadSourceStudyVariant => {
    const row = piRecord(value, 'study-variant');
    exact(row, ['id', 'roleResult', 'html', 'renders']);
    const packet = prepared.packets[index];
    if (packet === undefined || row.id !== packet.id) return fail('variant-binding');
    const verified = verifySignedPiStudyResult(row.roleResult, root);
    const expected = parseSourceStudyPacket(packet.bytes).outputContract.fixedBindings;
    if (canonicalJson(verified.receipt.fixedBindings) !== canonicalJson(expected)
      || verified.receipt.studyEvidence.packetSha256 !== sha256(packet.bytes)
      || verified.receipt.taskSha256 !== sha256(SOURCE_STUDY_TASK)
      || verified.receipt.provider !== host.provider || verified.receipt.model !== host.model
      || verified.receipt.parentSessionId !== host.parentSessionId) return fail('variant-authority');
    const htmlRow = piRecord(row.html, 'study-html');
    exact(htmlRow, ['path', 'sha256']);
    const html = file(root, htmlRow, 'html').artifact;
    if (html.sha256 !== sha256(verified.handback.files[0].content)) return fail('html-authority');
    if (!Array.isArray(row.renders) || row.renders.length !== 4) return fail('render-coverage');
    const renders = row.renders.map((value, index): StudyCapture => {
      const capture = piRecord(value, 'study-capture');
      exact(capture, ['path', 'sha256', 'viewport', 'state']);
      const state = index % 2 === 0 ? 'initial' as const : 'primary-work' as const;
      if (capture.state !== state) return fail('render-state');
      const viewport = index < 2
        ? { name: 'desktop' as const, width: 1280, height: 900 }
        : { name: 'mobile' as const, width: 390, height: 844 };
      if (canonicalJson(capture.viewport) !== canonicalJson(viewport)) return fail('render-viewport');
      const checked = file(root, capture, 'renders');
      const image = PNG.sync.read(checked.bytes);
      if (image.width !== viewport.width || image.height !== viewport.height) return fail('render-size');
      return { ...checked.artifact, viewport, state };
    });
    return { id: packet.id, html, renders, relationship: verified.handback.relationship,
      unresolvedConstraints: verified.handback.unresolvedConstraints };
  });
  return { sha256: digest, contextSha256: prepared.contextSha256, variants };
}

export function readSelectedSourceStudy(root: string, invocation: ProjectRunInvocation) {
  const pointer = piRecord(JSON.parse(readContainedRegularFile(root, SOURCE_STUDY_CURRENT,
    'selected source study').toString('utf8')), 'study-current');
  exact(pointer, ['schema', 'sha256']);
  if (pointer.schema !== SOURCE_STUDY_SELECTION_SCHEMA) return fail('selection-schema');
  const digest = piDigest(pointer.sha256, 'study-selection-sha');
  const selected = signedRecord(root, `${SOURCE_STUDY_BASE}/selections/${digest}.json`,
    SOURCE_STUDY_SELECTION_SCHEMA, digest);
  exact(selected, ['schema', 'setSha256', 'variantId', 'reason']);
  const set = readSourceStudySet(root, invocation, piDigest(selected.setSha256, 'selected-study-set'));
  const variant = set.variants.find(item => item.id === selected.variantId) ?? fail('selected-variant');
  piText(selected.reason, 'study-selection-reason');
  return { schema: 'selected-source-study-v2' as const, provisional: true as const,
    sha256: digest, setSha256: set.sha256, id: variant.id, html: variant.html,
    renders: variant.renders, unresolvedConstraints: variant.unresolvedConstraints };
}

export function readLatestSourceStudySet(root: string, invocation: ProjectRunInvocation) {
  if (!existsSync(join(root, SOURCE_STUDY_LATEST))) return null;
  const pointer = piRecord(JSON.parse(readContainedRegularFile(root, SOURCE_STUDY_LATEST,
    'latest source study set').toString('utf8')), 'study-latest');
  exact(pointer, ['schema', 'sha256']);
  if (pointer.schema !== SOURCE_STUDY_SET_SCHEMA) return fail('latest-schema');
  const set = readSourceStudySet(root, invocation, piDigest(pointer.sha256, 'latest-study-sha'));
  return { schema: SOURCE_STUDY_SET_SCHEMA, provisional: true as const,
    sha256: set.sha256, variants: set.variants };
}
