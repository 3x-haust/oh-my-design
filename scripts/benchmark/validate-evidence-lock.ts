import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { evidenceLockDigest, validateEvidenceLockEntry } from './materialize-evidence-lock.ts';
import { validateEvidenceSnapshot } from './materialize-evidence-lock.ts';
import type { EvidenceLock, EvidenceLockSnapshot, EvidenceSnapshotEntry } from './materialize-evidence-lock.ts';
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function freezePayload<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freezePayload(child); } return value; }
function safePath(path: string): string { if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`unsafe evidence path: ${path}`); return path; }
function fileAt(root: string, path: string): string { const absolute=resolve(root,...safePath(path).split('/')); const rel=relative(root,absolute); if(!rel||rel==='..'||rel.startsWith(`..${sep}`)) throw new Error(`evidence path escapes root: ${path}`); return absolute; }
/** Every run consumes this complete immutable graph; a valid but unrelated lock has no authority. */
export function validateEvidenceLockShape(lock: EvidenceLock): void { if(lock.schemaVersion!=='harness-v2-evidence-lock-v4'||!Array.isArray(lock.entries)||!/^[a-f0-9]{64}$/.test(lock.digest)) throw new Error('invalid evidence lock'); const ids=new Set<string>(); for(const entry of lock.entries){if(ids.has(entry.id)) throw new Error(`duplicate evidence entry: ${entry.id}`); ids.add(entry.id); validateEvidenceLockEntry(entry);} if(ids.size!==13||!Array.from({length:13},(_,index)=>ids.has(`E${index+1}`)).every(Boolean)||evidenceLockDigest(lock.entries)!==lock.digest) throw new Error('evidence lock is incomplete or drifted'); }
export function validateEvidenceLock(root: string, lock: EvidenceLock): EvidenceLockSnapshot {
  validateEvidenceLockShape(lock);
  const snapshot: EvidenceSnapshotEntry[] = lock.entries.map(entry => {
    const path=fileAt(root,entry.path), stat=lstatSync(path), bytes=readFileSync(path);
    if(!stat.isFile()||stat.isSymbolicLink()||hash(bytes)!==entry.sha256) throw new Error(`evidence lock mismatch: ${entry.path}`);
    let payload: Record<string, unknown>;
    try { const artifact=JSON.parse(new TextDecoder().decode(bytes)) as {kind?:unknown;schemaVersion?:unknown;payload?:unknown;digest?:unknown}; if(artifact.kind!==entry.kind||artifact.schemaVersion!==entry.schemaVersion||!artifact.payload||Array.isArray(artifact.payload)||artifact.digest!==hash(JSON.stringify(artifact.payload))) throw new Error(); payload=artifact.payload as Record<string,unknown>; } catch { throw new Error(`evidence artifact schema or digest mismatch: ${entry.id}`); }
    return Object.freeze({declaration:entry,bytes:new Uint8Array(bytes),payload:freezePayload(payload)});
  });
  return validateEvidenceSnapshot(lock,snapshot);
}
if(process.argv[1]?.endsWith('validate-evidence-lock.ts')) { const [root,lockPath]=process.argv.slice(2); if(!root||!lockPath) throw new Error('usage: validate-evidence-lock <root> <lock-path>'); validateEvidenceLock(root,JSON.parse(readFileSync(fileAt(root,lockPath),'utf8')) as EvidenceLock); }
