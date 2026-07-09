import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { readFrame } from './index.ts';
import type { Choice } from '../types.ts';

const designDir = (cwd: string): string => join(cwd, '.omd');

export function writeFrame(cwd: string, frontmatter: Record<string, unknown>, body: string): void {
  mkdirSync(designDir(cwd), { recursive: true });
  writeFileSync(join(designDir(cwd), 'frame.md'), `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body.trim()}\n`);
}

export function proposeFrame(cwd: string, opts: { problem: string; reframe: string; why?: string }): string {
  if (!opts.why || opts.why.trim().length < 10) {
    throw new Error(
      'A reframing without a cited observation is a guess. Pass --why with the review, '
      + 'ticket, datum, or user sentence it rests on.',
    );
  }
  const body = [
    '## The given problem', '', opts.problem.trim(), '',
    '## The reframing', '', opts.reframe.trim(), '',
    '## Evidence', '', opts.why.trim(),
  ].join('\n');

  writeFrame(cwd, { approved: false, why: opts.why.trim() }, body);
  return join(designDir(cwd), 'frame.md');
}

export function setGenerator(cwd: string, generator: string): void {
  const frame = readFrame(cwd);
  if (!frame) throw new Error('No frame yet. Run `omd frame propose` first.');
  const { body, ...frontmatter } = frame;
  writeFrame(cwd, { ...frontmatter, generator }, body);
}

export function logDecision(cwd: string, what: string, why: string): string {
  mkdirSync(designDir(cwd), { recursive: true });
  const path = join(designDir(cwd), 'decisions.md');
  if (!existsSync(path)) {
    writeFileSync(path, '# Decisions\n\nWhat was built is in the code. Why it was built that way is only here.\n');
  }
  const generator = readFrame(cwd)?.generator ?? '(none set)';
  appendFileSync(path, `\n## ${what}\n\n- When: ${new Date().toISOString()}\n- Point of view: ${generator}\n- Why: ${why}\n`);
  return path;
}

export function logChoice(cwd: string, opts: { among: string[]; chose: string; why?: string }): string {
  if (!opts.among.includes(opts.chose)) throw new Error(`${opts.chose} is not among ${opts.among.join(', ')}`);
  mkdirSync(join(designDir(cwd), 'taste'), { recursive: true });
  const path = join(designDir(cwd), 'taste', 'preferences.jsonl');

  const record: Choice = {
    ts: new Date().toISOString(),
    among: opts.among,
    chose: opts.chose,
    why: opts.why ?? null,
    generator: readFrame(cwd)?.generator ?? null,
  };
  appendFileSync(path, `${JSON.stringify(record)}\n`);
  return path;
}

export function tasteProfile(cwd: string): { n: number; records: Choice[] } {
  const path = join(designDir(cwd), 'taste', 'preferences.jsonl');
  if (!existsSync(path)) return { n: 0, records: [] };
  const records = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Choice);
  return { n: records.length, records };
}
