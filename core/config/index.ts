import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';

export type Checkpoint = 'none' | 'concept' | 'structure' | 'both';
export type DirectionPolicy = 'interactive' | 'autonomous';
export interface OmdConfig { checkpoint: Checkpoint; directionPolicy: DirectionPolicy }

const pathFor = (cwd: string): string => join(cwd, '.omd', 'config.json');

export function readConfig(cwd: string): OmdConfig {
  const path = pathFor(cwd);
  if (!existsSync(path)) return { checkpoint: 'none', directionPolicy: 'interactive' };
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<OmdConfig>;
  if (!['none', 'concept', 'structure', 'both'].includes(value.checkpoint ?? 'none')) {
    throw new Error('invalid .omd/config.json checkpoint');
  }
  if (value.directionPolicy !== undefined && !['interactive', 'autonomous'].includes(value.directionPolicy)) throw new Error('invalid .omd/config.json directionPolicy');
  // A preference is not run authority. Legacy checkpoint:none never grants autonomous choice.
  return { checkpoint: value.checkpoint ?? 'none', directionPolicy: value.directionPolicy ?? 'interactive' };
}

export function setCheckpoint(cwd: string, checkpoint: string, adapter?: ProjectWriteAdapter): string {
  if (!['none', 'concept', 'structure', 'both'].includes(checkpoint)) {
    throw new Error('checkpoint must be none, concept, structure, or both');
  }
  return requireProjectWriteAdapter(cwd, adapter)
    .write('.omd/config.json', `${JSON.stringify({ ...readConfig(cwd), checkpoint }, null, 2)}\n`);
}

export function setDirectionPolicy(cwd: string, directionPolicy: string, adapter?: ProjectWriteAdapter): string {
  if (!['interactive', 'autonomous'].includes(directionPolicy)) throw new Error('directionPolicy must be interactive or autonomous; autonomous still requires an explicit run grant');
  return requireProjectWriteAdapter(cwd, adapter).write('.omd/config.json', `${JSON.stringify({ ...readConfig(cwd), directionPolicy }, null, 2)}\n`);
}
