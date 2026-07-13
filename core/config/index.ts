import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Checkpoint = 'none' | 'concept' | 'structure' | 'both';
export interface OmdConfig { checkpoint: Checkpoint }

const pathFor = (cwd: string): string => join(cwd, '.omd', 'config.json');

export function readConfig(cwd: string): OmdConfig {
  const path = pathFor(cwd);
  if (!existsSync(path)) return { checkpoint: 'none' };
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<OmdConfig>;
  if (!['none', 'concept', 'structure', 'both'].includes(value.checkpoint ?? '')) {
    throw new Error('invalid .omd/config.json checkpoint');
  }
  return { checkpoint: value.checkpoint! };
}

export function setCheckpoint(cwd: string, checkpoint: string): string {
  if (!['none', 'concept', 'structure', 'both'].includes(checkpoint)) {
    throw new Error('checkpoint must be none, concept, structure, or both');
  }
  const path = pathFor(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ checkpoint }, null, 2)}\n`);
  return path;
}
