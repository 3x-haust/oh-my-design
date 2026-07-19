import { createHash } from 'node:crypto';

export function refIdentity(source: string, component: string): string {
  return `ref-${createHash('sha256').update(`${source}\0${component}`).digest('hex').slice(0, 16)}`;
}
