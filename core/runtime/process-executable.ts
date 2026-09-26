import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function observedProcessExecutableSha256(pid: number): string | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  let path: string | undefined;
  switch (process.platform) {
    case 'linux': path = `/proc/${pid}/exe`; break;
    case 'darwin': {
      const observed = spawnSync('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fpn'], { encoding: 'utf8', env: { PATH: '' }, timeout: 5000 });
      if (observed.status !== 0) return;
      const fields = observed.stdout.trim().split('\n');
      if (fields[0] !== `p${pid}`) return;
      path = fields.find(field => field.startsWith('n/'))?.slice(1);
      break;
    }
    default: return;
  }
  if (!path) return;
  try { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
  catch (error) {
    if (error instanceof Error && ['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(String(Reflect.get(error, 'code')))) return;
    throw error;
  }
}
