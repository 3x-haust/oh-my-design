import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, resolve, matchesGlob, sep } from 'node:path';
import type { Session } from '../types.ts';

const sessionPath = (cwd: string): string => join(cwd, '.omd', 'session.json');
const framePath = (cwd: string): string => join(cwd, '.omd', 'frame.md');

const isEnoent = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * The gate is installed globally but must not bite globally. Everything not named here
 * passes untouched — a session guards design surfaces, not the whole repo.
 */
export const DEFAULT_SCOPE: string[] = [
  '**/*.css',
  '**/*.scss',
  '**/*.tsx',
  '**/*.jsx',
  '**/*.vue',
  '**/*.svelte',
  '**/*.html',
  '.omd/**',
  '**/tokens.json',
  '**/tailwind.config.*',
];

const FRAME_TEMPLATE = `---
approved: false
why: ""
---

## The given problem

<Restate the brief exactly as it was handed to you. Add nothing.>

## The reframing

<Is this really the problem? State it as a hypothesis you might be wrong about.>

## Evidence

<A review, a ticket, a datum, a named competitor's pattern, or a sentence the user said.
"I think" is not evidence. Approval is refused without this.>

## The trade

<What is thrown away if the reframing is accepted, and what is gained.
A reframing that costs nothing is a restatement, not a reframing.>
`;

export function readSession(cwd: string): Session | null {
  let text: string;
  try {
    text = readFileSync(sessionPath(cwd), 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
  return JSON.parse(text) as Session;
}

export function startSession(cwd: string, brief: string, scope: string[] = DEFAULT_SCOPE): Session {
  const dir = join(cwd, '.omd');
  mkdirSync(dir, { recursive: true });

  const session: Session = { startedAt: new Date().toISOString(), brief, scope };
  writeFileSync(sessionPath(cwd), `${JSON.stringify(session, null, 2)}\n`);

  if (!existsSync(framePath(cwd))) writeFileSync(framePath(cwd), FRAME_TEMPLATE);

  return session;
}

export function endSession(cwd: string): void {
  try {
    rmSync(sessionPath(cwd), { force: true });
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
}

export function isGuarded(cwd: string, filePath: string, session = readSession(cwd)): boolean {
  if (!session) return false;

  // Resolve first. `relative(cwd, 'style.css')` would resolve the bare name against
  // process.cwd(), not cwd, and the resulting `../..` would read as "outside the project"
  // — silently opening the gate for every relative path a host happens to send.
  const rel = relative(cwd, resolve(cwd, filePath));
  if (rel === '' || rel.startsWith('..')) return false;

  const posixRel = rel.split(sep).join('/');
  return session.scope.some((pattern) => matchesGlob(posixRel, pattern));
}
