import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

export type EvidenceStatus = 'present';
export type EvidenceId = `E${number}`;
export type EvidenceArtifactKind = 'development-corpus' | 'legal-surface-matrix' | 'evaluator-holdouts' | 'projected-briefs' | 'runner-identity' | 'runner-report' | 'build-receipts' | 'browser-receipts' | 'reviewer-receipts' | 'score-report' | 'evidence-manifest' | 'protected-example' | 'reconciliation-receipt';
export interface EvidenceDeclaration { id: EvidenceId; path: string; kind: EvidenceArtifactKind; schemaVersion: string; sha256: string; }
export interface EvidenceLockEntry extends EvidenceDeclaration { status: EvidenceStatus; statusHash: string; }
export interface EvidenceLock { schemaVersion: 'harness-v2-evidence-lock-v4'; entries: readonly EvidenceLockEntry[]; digest: string; }
export interface EvidenceSnapshotEntry { readonly declaration: EvidenceLockEntry; readonly bytes: Uint8Array; readonly payload: Readonly<Record<string, unknown>>; }
export interface EvidenceLockSnapshot { readonly lock: EvidenceLock; readonly entries: Readonly<Record<string, EvidenceSnapshotEntry>>; }

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const sha256 = /^[a-f0-9]{64}$/;
const PINNED_TRUST_ROOT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA8ufBmojXEKx2iORbme9uRRE4ZicHZmF1EJrZpPtqAPo=\n-----END PUBLIC KEY-----\n`;
const expectedEvidence: Readonly<Record<EvidenceId, Omit<EvidenceDeclaration, 'id' | 'sha256'>>> = {
  E1:{path:'.omd/evidence/harness-v2/development-corpus.json',kind:'development-corpus',schemaVersion:'harness-v2-development-corpus-v1'}, E2:{path:'.omd/evidence/harness-v2/legal-surface-matrix.json',kind:'legal-surface-matrix',schemaVersion:'harness-v2-legal-surface-matrix-v1'}, E3:{path:'.omd/evidence/harness-v2/evaluator-holdouts.json',kind:'evaluator-holdouts',schemaVersion:'harness-v2-evaluator-holdouts-v1'}, E4:{path:'.omd/evidence/harness-v2/projected-briefs.json',kind:'projected-briefs',schemaVersion:'harness-v2-projected-briefs-v1'}, E5:{path:'.omd/evidence/harness-v2/runner-identity.json',kind:'runner-identity',schemaVersion:'harness-v2-runner-identity-v1'}, E6:{path:'.omd/evidence/harness-v2/runner-report.json',kind:'runner-report',schemaVersion:'harness-v2-run-report-v4'}, E7:{path:'.omd/evidence/harness-v2/build-receipts.json',kind:'build-receipts',schemaVersion:'harness-v2-build-receipts-v1'}, E8:{path:'.omd/evidence/harness-v2/browser-receipts.json',kind:'browser-receipts',schemaVersion:'harness-v2-browser-receipts-v1'}, E9:{path:'.omd/evidence/harness-v2/reviewer-receipts.json',kind:'reviewer-receipts',schemaVersion:'harness-v2-reviewer-receipts-v1'}, E10:{path:'.omd/evidence/harness-v2/score-report.json',kind:'score-report',schemaVersion:'harness-v2-score-report-v1'}, E11:{path:'.omd/evidence/harness-v2/evidence-manifest.json',kind:'evidence-manifest',schemaVersion:'harness-v2-evidence-manifest-v1'}, E12:{path:'example/harness-v2-protected.json',kind:'protected-example',schemaVersion:'harness-v2-protected-example-v1'}, E13:{path:'.omd/evidence/harness-v2/reconciliation-receipt.json',kind:'reconciliation-receipt',schemaVersion:'harness-v2-reconciliation-receipt-v1'} };
const ids = Object.keys(expectedEvidence) as EvidenceId[];
function requiredExpectedEvidence(id: EvidenceId): Omit<EvidenceDeclaration, 'id' | 'sha256'> { const expected = expectedEvidence[id]; if (!expected) throw new Error(`required expected evidence is missing: ${id}`); return expected; }
const parentIds: Readonly<Record<EvidenceId, readonly EvidenceId[]>> = { E1:[], E2:['E1'], E3:['E1','E2'], E4:['E3'], E5:['E4'], E6:['E4','E5'], E7:['E6'], E8:['E7'], E9:['E8'], E10:['E9'], E11:['E10'], E12:['E1'], E13:['E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12'] };
function canonical(value: unknown): string { return JSON.stringify(value); }
function safePath(path: string): string { if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`unsafe evidence path: ${path}`); return path; }
function fileAt(root: string, path: string): string { const absolute = resolve(root, ...safePath(path).split('/')); const rel = relative(root, absolute); if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`evidence path escapes root: ${path}`); return absolute; }
function payloadDigest(artifact: { payload?: unknown }): string { return hash(canonical(artifact.payload)); }
function manifest(entries: readonly EvidenceDeclaration[], includeE13 = false): readonly EvidenceDeclaration[] { return Object.freeze([...entries].filter(entry => includeE13 || entry.id !== 'E13').sort((a,b) => Number(a.id.slice(1)) - Number(b.id.slice(1))).map(entry => Object.freeze({ id:entry.id, path:entry.path, kind:entry.kind, schemaVersion:entry.schemaVersion, sha256:entry.sha256 }))); }
function rootDigest(entries: readonly EvidenceDeclaration[]): string { return hash(canonical(manifest(entries).map(entry => ({ id: entry.id, path: entry.path, kind: entry.kind, schemaVersion: entry.schemaVersion })))); }
function e13Statement(entries: readonly EvidenceDeclaration[], payload: Record<string, unknown>): object {
  const { trustRoot: _trustRoot, ...e13Payload } = payload;
  return { schemaVersion: 'harness-v2-evidence-statement-v1', evidence: manifest(entries), e13PayloadDigest: hash(canonical(e13Payload)), runInputDigests: payload.runInputDigests };
}
function verifyPinnedRoot(entries: readonly EvidenceDeclaration[], payload: Record<string, unknown>): boolean {
  try {
    const trustRoot = payload.trustRoot as { algorithm?: unknown; statement?: unknown; signature?: unknown };
    return trustRoot.algorithm === 'ed25519' && canonical(trustRoot.statement) === canonical(e13Statement(entries, payload)) && typeof trustRoot.signature === 'string' && verify(null, Buffer.from(canonical(trustRoot.statement)), createPublicKey(PINNED_TRUST_ROOT_PUBLIC_KEY), Buffer.from(trustRoot.signature, 'base64'));
  } catch { return false; }
}
function parseArtifact(root: string, declaration: EvidenceDeclaration): { payload: Record<string, unknown> } {
  let artifact: { kind?: unknown; schemaVersion?: unknown; payload?: unknown; digest?: unknown }; try { artifact = JSON.parse(readFileSync(fileAt(root, declaration.path), 'utf8')); } catch { throw new Error(`evidence artifact must be JSON: ${declaration.id}`); }
  if (artifact.kind !== declaration.kind || artifact.schemaVersion !== declaration.schemaVersion || artifact.digest !== payloadDigest(artifact) || !sha256.test(String(artifact.digest)) || !artifact.payload || Array.isArray(artifact.payload)) throw new Error(`evidence artifact schema or digest mismatch: ${declaration.id}`);
  return { payload: artifact.payload as Record<string, unknown> };
function parseArtifactBytes(bytes: Uint8Array, declaration: EvidenceDeclaration): { payload: Record<string, unknown> } {
  let artifact: { kind?: unknown; schemaVersion?: unknown; payload?: unknown; digest?: unknown }; try { artifact = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(`evidence artifact must be JSON: ${declaration.id}`); }
  if (artifact.kind !== declaration.kind || artifact.schemaVersion !== declaration.schemaVersion || artifact.digest !== payloadDigest(artifact) || !sha256.test(String(artifact.digest)) || !artifact.payload || Array.isArray(artifact.payload)) throw new Error(`evidence artifact schema or digest mismatch: ${declaration.id}`);
  return { payload: artifact.payload as Record<string, unknown> };
}
}
function validateLineage(payload: Record<string, unknown>, declaration: EvidenceDeclaration, entries: readonly EvidenceDeclaration[]): void {
  const lineage = payload.lineage as { rootDigest?: unknown; parents?: unknown } | undefined;
  if (!lineage || lineage.rootDigest !== rootDigest(entries) || !lineage.parents || Array.isArray(lineage.parents)) throw new Error(`typed lineage missing: ${declaration.id}`);
  const parents = lineage.parents as Record<string, unknown>; const expected = parentIds[declaration.id]; if (!expected) throw new Error(`required lineage definition is missing: ${declaration.id}`);
  if (Object.keys(parents).length !== expected.length || expected.some(id => parents[id] !== entries.find(entry => entry.id === id)?.sha256)) throw new Error(`typed lineage mismatch: ${declaration.id}`);
}
export function validateEvidenceArtifact(root: string, declaration: EvidenceDeclaration, entries: readonly EvidenceDeclaration[]): void {
  validateLineage(parseArtifact(root, declaration).payload, declaration, entries);
}
function validateAliasAuthority(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('E4 lacks immutable per-alias authority');
  for (const [briefId, aliases] of Object.entries(value as Record<string, unknown>)) {
    if (!briefId || !Array.isArray(aliases) || !aliases.length) throw new Error('E4 alias authority is malformed');
    const seen = new Set<string>();
    for (const entry of aliases) {
      const authority = entry as { alias?: unknown; sha256?: unknown; byteLength?: unknown };
      if (!authority || typeof authority.alias !== 'string' || seen.has(authority.alias) || !sha256.test(String(authority.sha256)) || typeof authority.byteLength !== 'number' || !Number.isSafeInteger(authority.byteLength) || authority.byteLength <= 0) throw new Error('E4 alias authority is malformed');
      seen.add(authority.alias);
    }
  }
}
function signedRecord(value: unknown, id: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${id} payload must be an object`);
  return value as Record<string, unknown>;
}
function signedHash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !sha256.test(value)) throw new Error(`signed receipt lacks ${field}`);
  return value;
}
function signedBudget(value: unknown, id: string): Record<string, unknown> {
  const budget = signedRecord(value, id);
  for (const field of ['rounds', 'browserLaunches', 'elapsedMinutes', 'tokens', 'usd']) if (typeof budget[field] !== 'number' || !Number.isFinite(budget[field]) || budget[field]! < 0) throw new Error(`${id} has invalid measured budget`);
  return budget;
}
function validateSignedRunConfiguration(entries: readonly EvidenceDeclaration[], payload: (id: EvidenceId) => Record<string, unknown>): void {
  const e5 = signedRecord(payload('E5'), 'E5'), e6 = signedRecord(payload('E6'), 'E6'), e7 = signedRecord(payload('E7'), 'E7'), e8 = signedRecord(payload('E8'), 'E8'), e9 = signedRecord(payload('E9'), 'E9'), e10 = signedRecord(payload('E10'), 'E10'), e11 = signedRecord(payload('E11'), 'E11');
  if (typeof e5.runnerId !== 'string' || !e5.runnerId || typeof e5.hostIdentity !== 'string' || !e5.hostIdentity) throw new Error('E5 lacks signed runner identity');
  if (typeof e5.observerIdentity !== 'string' || !e5.observerIdentity) throw new Error('E5 lacks signed observer identity');
  const clock = signedRecord(e5.clock, 'E5 clock');
  if (!Number.isSafeInteger(clock.issuedAt) || !Number.isSafeInteger(clock.expiresAt) || (clock.expiresAt as number) <= (clock.issuedAt as number) || typeof clock.elapsedMinutes !== 'number' || !Number.isFinite(clock.elapsedMinutes) || clock.elapsedMinutes < 0) throw new Error('E5 lacks a deterministic signed clock');
  const observer = signedRecord(e5.observer, 'E5 observer');
  if (observer.identity !== e5.observerIdentity) throw new Error('E5 observer identity is malformed');
  signedHash(observer.executableSha256, 'E5 observer executableSha256');
  signedHash(observer.configIdentity, 'E5 observer configIdentity');
  if (typeof observer.publicKey !== 'string' || !observer.publicKey.includes('BEGIN PUBLIC KEY')) throw new Error('E5 observer lacks pinned Ed25519 public key');
  signedBudget({ rounds: 0, browserLaunches: 0, elapsedMinutes: 0, ...observer.telemetry as Record<string, unknown> }, 'E5 observer telemetry');
  for (const [id, value] of [['host', e5.host], ['browser', e5.browser]] as const) {
    const process = signedRecord(value, `E5 ${id}`);
    signedHash(process.executableSha256, `E5 ${id} executableSha256`);
    signedHash(process.configIdentity, `E5 ${id} configIdentity`);
    signedBudget({ rounds: 0, browserLaunches: 0, elapsedMinutes: 0, ...process.telemetry as Record<string, unknown> }, `E5 ${id} telemetry`);
  }
  if (!Array.isArray(e5.reviewers) || e5.reviewers.length < 3) throw new Error('E5 lacks signed reviewer identities');
  for (const reviewer of e5.reviewers) {
    const process = signedRecord(reviewer, 'E5 reviewer');
    if (typeof process.laneId !== 'string' || !process.laneId || typeof process.raterId !== 'string' || !process.raterId) throw new Error('E5 reviewer identity is malformed');
    signedHash(process.executableSha256, 'E5 reviewer executableSha256');
    signedHash(process.configIdentity, 'E5 reviewer configIdentity');
    signedBudget({ rounds: 0, browserLaunches: 0, elapsedMinutes: 0, ...process.telemetry as Record<string, unknown> }, 'E5 reviewer telemetry');
  }
  for (const [id, value] of [['E6', e6], ['E7', e7], ['E8', e8], ['E9', e9], ['E10', e10], ['E11', e11]] as const) signedHash(value.receiptDigest, `${id} receiptDigest`);
  for (const [id, value] of [['E6', e6], ['E10', e10], ['E11', e11]] as const) signedHash(value.lineageRoot, `${id} lineageRoot`);
  for (const [id, value, fields] of [['E6', e6, ['observerAuthorityDigest', 'buildReceiptDigest', 'browserReceiptDigest', 'reviewerReceiptDigest', 'lockDigest', 'observationEnvelope', 'processSessionIdentity']], ['E7', e7, ['buildReceiptDigest']], ['E8', e8, ['browserReceiptDigest']], ['E9', e9, ['reviewerReceiptDigest']], ['E11', e11, ['observerAuthorityDigest', 'lockDigest', 'observationEnvelope', 'processSessionIdentity']]] as const) for (const field of fields) signedHash(value[field], `${id} ${field}`);
  const receiptDigest = signedHash(e6.receiptDigest, 'E6 receiptDigest');
  if ([e7, e8, e9, e10, e11].some(receipt => receipt.receiptDigest !== receiptDigest)) throw new Error('E5-E11 receipt digest join is inconsistent');
  const lineageRoot = signedHash(e6.lineageRoot, 'E6 lineageRoot');
  if (e10.lineageRoot !== lineageRoot || e11.lineageRoot !== lineageRoot) throw new Error('E5-E11 lineage root join is inconsistent');
  if (e6.runnerId !== e5.runnerId || e6.hostIdentity !== e5.hostIdentity || !e6.result || typeof e6.result !== 'object') throw new Error('E5-E6 runner identity or result join is inconsistent');
  const measured = signedBudget(e6.measuredBudget, 'E6');
  if (JSON.stringify(e10.measuredBudget) !== JSON.stringify(measured) || JSON.stringify(e11.measuredBudget) !== JSON.stringify(measured) || JSON.stringify(e10.result) !== JSON.stringify(e6.result) || JSON.stringify(e11.result) !== JSON.stringify(e6.result)) throw new Error('E6-E11 score or measured budget join is inconsistent');
}
function validateTrustRoot(entries: readonly EvidenceDeclaration[], payloadFor: (id: EvidenceId) => Record<string, unknown>): void {
  const declaration = entries.find(entry => entry.id === 'E13'); if (!declaration) throw new Error('missing E13 trust root');
  const payload = payloadFor('E13'); validateLineage(payload, declaration, entries);
  const inputDigests = payload.runInputDigests;
  if (!inputDigests || typeof inputDigests !== 'object' || Array.isArray(inputDigests) || !['developmentCorpus','legalSurfaceMatrix','evaluatorHoldouts','projectedBriefs'].every(key => sha256.test(String((inputDigests as Record<string, unknown>)[key])))) throw new Error('E13 lacks signed canonical run input digests');
  const e4 = entries.find(entry => entry.id === 'E4'); if (!e4) throw new Error('missing E4 alias authority');
  const aliasAuthority = payloadFor('E4').aliasAuthority; validateAliasAuthority(aliasAuthority);
  if (payload.aliasAuthorityDigest !== hash(canonical(aliasAuthority))) throw new Error('E13 does not bind E4 alias authority');
  const receipts = payload.runnerReceiptHashes;
  if (!receipts || typeof receipts !== 'object' || Array.isArray(receipts) || !['E5','E6','E7','E8','E9','E10','E11'].every(id => (receipts as Record<string, unknown>)[id] === entries.find(entry => entry.id === id)?.sha256)) throw new Error('E13 does not reconcile runner receipts');
  validateSignedRunConfiguration(entries, payloadFor);
  if (!verifyPinnedRoot(entries, payload)) throw new Error('E13 is not signed by the immutable approved trust root');
}
export function readEvidencePayload(root: string, declaration: EvidenceDeclaration): Readonly<Record<string, unknown>> { return Object.freeze(parseArtifact(root, declaration).payload); }
export function validateEvidenceSnapshot(lock: EvidenceLock, entries: readonly EvidenceSnapshotEntry[]): EvidenceLockSnapshot {
  if (entries.length !== lock.entries.length) throw new Error('evidence snapshot is incomplete');
  const byId = Object.fromEntries(entries.map(entry => [entry.declaration.id, entry])) as Record<string, EvidenceSnapshotEntry>;
  for (const declaration of lock.entries) { const entry=byId[declaration.id]; if (!entry || entry.declaration !== declaration || hash(entry.bytes)!==declaration.sha256) throw new Error(`evidence snapshot mismatch: ${declaration.id}`); validateLineage(entry.payload as Record<string, unknown>, declaration, lock.entries); }
  const payload = (id: EvidenceId) => { const entry=byId[id]; if (!entry) throw new Error(`missing ${id}`); return entry.payload as Record<string, unknown>; };
  validateTrustRoot(lock.entries, payload);
  return Object.freeze({ lock, entries: Object.freeze(byId) });
}
export function readEvidenceSnapshotPayload(snapshot: EvidenceLockSnapshot, id: EvidenceId): Readonly<Record<string, unknown>> { const entry=snapshot.entries[id]; if (!entry) throw new Error(`missing signed ${id}`); return entry.payload; }
export function validateApprovedEvidenceRoot(root: string, entries: readonly EvidenceDeclaration[]): void { validateTrustRoot(entries, id => { const entry=entries.find(candidate=>candidate.id===id); if (!entry) throw new Error(`missing ${id}`); return parseArtifact(root,entry).payload; }); }
function entryPayload(entry: EvidenceLockEntry): object { return { id: entry.id, path: entry.path, kind: entry.kind, schemaVersion: entry.schemaVersion, sha256: entry.sha256, status: entry.status }; }
export function evidenceStatusHash(entry: EvidenceLockEntry): string { return hash(canonical(entryPayload(entry))); }
function validateEntry(entry: EvidenceLockEntry): void { const expected = requiredExpectedEvidence(entry.id); if (entry.path !== expected.path || entry.kind !== expected.kind || entry.schemaVersion !== expected.schemaVersion || entry.status !== 'present' || !sha256.test(entry.sha256) || !sha256.test(entry.statusHash) || entry.statusHash !== evidenceStatusHash(entry)) throw new Error(`evidence declaration is not authoritative: ${entry.id}`); safePath(entry.path); }
export function validateEvidenceLockEntry(entry: EvidenceLockEntry): void { validateEntry(entry); }
export function evidenceLockDigest(entries: readonly EvidenceLockEntry[]): string { return hash(canonical([...entries].filter(entry => /^E[1-5]$/.test(entry.id)).sort((a,b)=>a.id.localeCompare(b.id)).map(entry => ({ id: entry.id, path: entry.path, kind: entry.kind, schemaVersion: entry.schemaVersion, sha256: entry.sha256 })))); }
export function materializeEvidenceLock(root: string, declarations: readonly EvidenceDeclaration[]): EvidenceLock { const seen = new Set<string>(); const entries = declarations.map(declaration => { if (seen.has(declaration.id)) throw new Error(`duplicate evidence declaration: ${declaration.id}`); seen.add(declaration.id); const expected = requiredExpectedEvidence(declaration.id); if (declaration.path !== expected.path || declaration.kind !== expected.kind || declaration.schemaVersion !== expected.schemaVersion || !sha256.test(declaration.sha256)) throw new Error(`evidence declaration is not authoritative: ${declaration.id}`); const absolute = fileAt(root,declaration.path); const stat = lstatSync(absolute); if (!stat.isFile() || stat.isSymbolicLink() || hash(readFileSync(absolute)) !== declaration.sha256) throw new Error(`approved evidence hash mismatch: ${declaration.id}`); return declaration; }).sort((a,b)=>a.id.localeCompare(b.id)); if (entries.length !== ids.length || !ids.every(id=>seen.has(id))) throw new Error('evidence lock requires complete E1-E13 entries'); for (const entry of entries) validateEvidenceArtifact(root,entry,entries); validateApprovedEvidenceRoot(root,entries); const lockEntries = entries.map(entry => { const base: EvidenceLockEntry={...entry,status:'present',statusHash:''}; return {...base,statusHash:evidenceStatusHash(base)}; }); return {schemaVersion:'harness-v2-evidence-lock-v4',entries:lockEntries,digest:evidenceLockDigest(lockEntries)}; }
export function writeEvidenceLock(root: string, declarations: readonly EvidenceDeclaration[], output: string): EvidenceLock { const lock=materializeEvidenceLock(root,declarations); writeFileSync(fileAt(root,output),`${JSON.stringify(lock,null,2)}\n`,{encoding:'utf8',flag:'wx'}); return lock; }
if(process.argv[1]?.endsWith('materialize-evidence-lock.ts')) { const [root,output,declarationFile]=process.argv.slice(2); if(!root||!output||!declarationFile) throw new Error('usage: materialize-evidence-lock <root> <output> <declarations.json>'); writeEvidenceLock(root,JSON.parse(readFileSync(fileAt(root,declarationFile),'utf8')) as EvidenceDeclaration[],output); }
