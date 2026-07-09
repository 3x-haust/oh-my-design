import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Frame } from '../types.ts';

const framePath = (cwd: string): string => join(cwd, '.omd', 'frame.md');

const isEnoent = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * The frame is a record, not a gate. Nothing blocks on it.
 *
 * An earlier version made a human sign the reframing before any file could be written.
 * That solved the wrong problem: a wrong reframing is caught by building something,
 * rendering it, and looking — not by a signature. Worse, it made the loop impossible,
 * since nothing could be built while approval was pending, so there was nothing to look
 * at, so nothing could reveal the reframing was wrong.
 */
export function readFrame(cwd: string): Frame | null {
  let text: string;
  try {
    text = readFileSync(framePath(cwd), 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }

  if (!text.startsWith('---\n')) return { body: text };

  const closeIndex = text.indexOf('\n---', 3);
  if (closeIndex === -1) return { body: text };

  const frontmatter = (parse(text.slice(4, closeIndex)) ?? {}) as Partial<Frame>;
  const rest = text.slice(closeIndex + 4);
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;

  return { ...frontmatter, body };
}
