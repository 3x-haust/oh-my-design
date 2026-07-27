import { createHash } from 'node:crypto';
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { evidenceLockDigest, validateEvidenceLockEntry } from './materialize-evidence-lock.ts';
import { validateEvidenceSnapshot } from './materialize-evidence-lock.ts';
import type { EvidenceLock, EvidenceLockSnapshot, EvidenceSnapshotEntry } from './materialize-evidence-lock.ts';
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function safePath(path: string): string { if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`unsafe evidence path: ${path}`); return path; }
function fileAt(root: string, path: string): string { const absolute=resolve(root,...safePath(path).split('/')); const rel=relative(root,absolute); if(!rel||rel==='..'||rel.startsWith(`..${sep}`)) throw new Error(`evidence path escapes root: ${path}`); return absolute; }
/** Every run consumes this complete immutable graph; a valid but unrelated lock has no authority. */
export function validateEvidenceLockShape(lock: EvidenceLock): void { if(lock.schemaVersion!=='harness-v2-evidence-lock-v4'||!Array.isArray(lock.entries)||!/^[a-f0-9]{64}$/.test(lock.digest)) throw new Error('invalid evidence lock'); const ids=new Set<string>(); for(const entry of lock.entries){if(ids.has(entry.id)) throw new Error(`duplicate evidence entry: ${entry.id}`); ids.add(entry.id); validateEvidenceLockEntry(entry);} if(ids.size!==13||!Array.from({length:13},(_,index)=>ids.has(`E${index+1}`)).every(Boolean)||evidenceLockDigest(lock.entries)!==lock.digest) throw new Error('evidence lock is incomplete or drifted'); }
export function validateEvidenceLock(root: string, lock: EvidenceLock): EvidenceLockSnapshot {
  validateEvidenceLockShape(lock);
  const snapshot: EvidenceSnapshotEntry[] = lock.entries.map(entry => {
    const path=fileAt(root,entry.path), descriptor=openSync(path,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
    let bytes:Buffer;
    try {
      const before=fstatSync(descriptor), pathStat=lstatSync(path);
      if(!before.isFile()||pathStat.isSymbolicLink()||!pathStat.isFile()||before.dev!==pathStat.dev||before.ino!==pathStat.ino||before.size!==pathStat.size) throw new Error(`evidence artifact is not a stable regular file: ${entry.id}`);
      bytes=readFileSync(descriptor);
      const after=fstatSync(descriptor);
      if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||hash(bytes)!==entry.sha256) throw new Error(`evidence artifact changed while validating: ${entry.id}`);
    } finally { closeSync(descriptor); }
    return Object.freeze({declaration:entry,bytes:new Uint8Array(bytes)});
  });
  return validateEvidenceSnapshot(lock,snapshot);
}
if(process.argv[1]?.endsWith('validate-evidence-lock.ts')) { const [root,lockPath]=process.argv.slice(2); if(!root||!lockPath) throw new Error('usage: validate-evidence-lock <root> <lock-path>'); validateEvidenceLock(root,JSON.parse(readFileSync(fileAt(root,lockPath),'utf8')) as EvidenceLock); }
