import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { loadDesignerCase } from '../cases/index.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';

const SCHEMA = 'designer-case-consultations-v1';
const DIRECTORY = '.omd/designer-cases';
const POINTER = '.omd/designer-cases.json';
const fail = (reason: string): never => { throw new Error(`DESIGNER_CASE_CONSULTATIONS: ${reason}`); };
const bytesAt = (root: string, path: string) => readContainedRegularFile(root, path, 'designer case consultation');

function currentRecord(root: string) {
  if (!existsSync(join(root, POINTER))) return null;
  const pointer = piRecord(JSON.parse(bytesAt(root, POINTER).toString('utf8')), 'designer-case-pointer');
  const digest = piDigest(pointer.sha256, 'designer-case-record-sha');
  const path = `${DIRECTORY}/records/${digest}.json`;
  if (pointer.schema !== SCHEMA || pointer.path !== path
    || Object.keys(pointer).sort().join() !== 'path,schema,sha256') return fail('pointer');
  const bytes = bytesAt(root, path);
  if (sha256(bytes) !== digest) return fail('record digest');
  const signed = piRecord(JSON.parse(bytes.toString('utf8')), 'designer-case-record');
  if (Object.keys(signed).sort().join() !== 'authority,cases,requestSha256,schema,signature,use'
    || bytes.toString('utf8') !== canonicalJson(signed)) return fail('record fields');
  const { signature, ...record } = signed;
  if (record.schema !== SCHEMA || record.authority !== 'none'
    || record.use !== 'worked-example-not-visual-reference') return fail('record authority');
  if (!verifyNativeObservation(root, SCHEMA, sha256(canonicalJson(record)),
    piText(signature, 'designer-case-signature'))) return fail('record signature');
  const requestSha256 = piDigest(record.requestSha256, 'designer-case-request');
  if (!Array.isArray(record.cases) || record.cases.length === 0) return fail('cases');
  const cases = record.cases.map(value => {
    const row = piRecord(value, 'designer-case-descriptor');
    if (Object.keys(row).sort().join() !== 'caseSha256,id') return fail('case fields');
    return { id: piText(row.id, 'designer-case-id'), caseSha256: piDigest(row.caseSha256, 'designer-case-sha') };
  });
  if (new Set(cases.map(item => item.id)).size !== cases.length) return fail('duplicate cases');
  return { digest, requestSha256, cases };
}

export function recordDesignerCaseConsultation(
  root: string, requestSha256: string, id: string, writer: ProjectWriteAdapter,
) {
  piDigest(requestSha256, 'designer-case-request');
  const opened = loadDesignerCase(id);
  const previous = currentRecord(root);
  const cases = previous?.requestSha256 === requestSha256 ? previous.cases.filter(item => item.id !== id) : [];
  cases.push({ id, caseSha256: opened.sha256 });
  cases.sort((a, b) => a.id.localeCompare(b.id));
  const record = { schema: SCHEMA, requestSha256, cases, authority: 'none',
    use: 'worked-example-not-visual-reference' };
  const signature = signNativeObservation(root, SCHEMA, sha256(canonicalJson(record)));
  const bytes = Buffer.from(canonicalJson({ ...record, signature }));
  const digest = sha256(bytes), path = `${DIRECTORY}/records/${digest}.json`;
  // `.omd/` is a committed project record. Third-party frames stay in the private source
  // root and are re-read and digest-verified there; the record binds only their identity.
  writer.writeContentAddressed(path, bytes);
  writer.write(POINTER, canonicalJson({ schema: SCHEMA, path, sha256: digest }));
  return opened;
}

export function consultedDesignerCases(root: string, requestSha256?: string) {
  const record = currentRecord(root);
  if (record === null) return null;
  if (requestSha256 !== undefined && record.requestSha256 !== requestSha256) return null;
  const opened = record.cases.map(item => {
    const source = loadDesignerCase(item.id);
    if (source.sha256 !== item.caseSha256) return fail('source case changed');
    return source;
  });
  return {
    context: {
      schema: SCHEMA, sha256: record.digest, requestSha256: record.requestSha256,
      authority: 'none' as const, use: 'worked-example-not-visual-reference' as const,
      cases: opened.map(item => ({ ...item.case, caseSha256: item.sha256 })),
    },
    renders: opened.flatMap(item => item.renders.map(({ path: _path, ...frame }) => frame)),
  };
}
