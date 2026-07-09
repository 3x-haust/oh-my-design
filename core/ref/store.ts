import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import type { Reference } from '../types.ts';

const refsDir = (cwd: string): string => join(cwd, '.omd', 'refs');

/** Hostname of a URL, or the basename (without extension) of a file path. */
function hostPart(source: string): string {
  try {
    const url = new URL(source);
    if (url.protocol === 'file:') return basename(url.pathname).replace(/\.[^.]+$/, '');
    return url.hostname.replace(/^www\./, '');
  } catch {
    return basename(source).replace(/\.[^.]+$/, '');
  }
}

function slugFor(ref: Reference): string {
  return `${hostPart(ref.source)}.${ref.component}`;
}

export function saveRef(cwd: string, ref: Reference): string {
  const dir = refsDir(cwd);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slugFor(ref)}.json`);
  writeFileSync(path, `${JSON.stringify(ref, null, 2)}\n`);
  return resolve(path);
}

function isReference(value: unknown): value is Reference {
  return typeof value === 'object' && value !== null && 'invariants' in value;
}

export function loadRefs(cwd: string): Reference[] {
  const dir = refsDir(cwd);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const refs: Reference[] = [];
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (isReference(parsed)) refs.push(parsed);
    } catch {
      // corrupt file: skip it, don't fail the run
    }
  }

  return refs.sort((a, b) => a.source.localeCompare(b.source) || a.component.localeCompare(b.component));
}
