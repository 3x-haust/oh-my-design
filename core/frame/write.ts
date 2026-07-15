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

/**
 * Nobody signs this. The `--why` requirement is not a gate on the human — it is a gate on
 * the agent, which will otherwise reframe a brief on a hunch and call the hunch insight.
 *
 * The three UX anchor fields (uxTask, uxFrequentAction, uxCostliestError) are optional
 * here for backward compatibility — old callers that do not supply them produce a frame
 * that FRAME-UX-INCOMPLETE will flag. The framer.agent.yaml is expected to always supply
 * all three after answering the UX interrogation questions from theory/ux.md.
 */
export function writeFrameRecord(cwd: string, opts: {
  problem: string;
  reframe: string;
  why?: string;
  uxTask?: string;
  uxFrequentAction?: string;
  uxCostliestError?: string;
  uxSurface?: string;
}): string {
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

  const frontmatter: Record<string, unknown> = { why: opts.why.trim(), writtenAt: new Date().toISOString() };
  if (opts.uxTask?.trim()) frontmatter['uxTask'] = opts.uxTask.trim();
  if (opts.uxFrequentAction?.trim()) frontmatter['uxFrequentAction'] = opts.uxFrequentAction.trim();
  if (opts.uxCostliestError?.trim()) frontmatter['uxCostliestError'] = opts.uxCostliestError.trim();
  if (opts.uxSurface?.trim()) frontmatter['uxSurface'] = opts.uxSurface.trim();

  writeFrame(cwd, frontmatter, body);
  return join(designDir(cwd), 'frame.md');
}

/**
 * What the loop does when a rendered candidate reveals the problem was misunderstood.
 * The old framing is kept, not overwritten: a frame that changed twice is the most
 * interesting thing in the repository six months later.
 */
export function reframe(cwd: string, opts: { to: string; because: string }): string {
  const frame = readFrame(cwd);
  if (!frame) throw new Error('No frame yet. Run `omd frame set` first.');

  const { body, ...frontmatter } = frame;
  const revision = (typeof frontmatter['revision'] === 'number' ? frontmatter['revision'] : 0) + 1;
  const appended = [
    body.trimEnd(),
    '',
    `## Reframing ${revision}`,
    '',
    `**Now:** ${opts.to.trim()}`,
    '',
    `**Because:** ${opts.because.trim()}`,
  ].join('\n');

  writeFrame(cwd, { ...frontmatter, revision, reframedAt: new Date().toISOString() }, appended);
  return join(designDir(cwd), 'frame.md');
}

export function setGenerator(cwd: string, generator: string): void {
  const frame = readFrame(cwd);
  const { body = '', ...frontmatter } = frame ?? {};
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
    actor: 'agent',
    kind: 'selection',
    subject: opts.chose,
    evidence: opts.why ?? '',
    among: opts.among,
    chose: opts.chose,
    why: opts.why ?? null,
    generator: readFrame(cwd)?.generator ?? null,
  };
  appendFileSync(path, `${JSON.stringify(record)}\n`);
  return path;
}

export function logTaste(cwd: string, opts: {
  subject: string;
  kind: 'selection' | 'praise' | 'rejection' | 'overrule';
  evidence: string;
  fromUser: boolean;
}): string {
  if (!opts.fromUser) throw new Error('Taste records require --from-user; inferred preference is not user evidence.');
  if (!opts.subject.trim() || !opts.evidence.trim()) throw new Error('Taste subject and verbatim --evidence are required.');
  mkdirSync(join(designDir(cwd), 'taste'), { recursive: true });
  const path = join(designDir(cwd), 'taste', 'preferences.jsonl');
  const record: Choice = {
    ts: new Date().toISOString(), actor: 'user', kind: opts.kind,
    subject: opts.subject.trim(), evidence: opts.evidence.trim(),
  };
  appendFileSync(path, `${JSON.stringify(record)}\n`);
  return path;
}

export function tasteProfile(cwd: string, all = false): { n: number; records: Choice[] } {
  const path = join(designDir(cwd), 'taste', 'preferences.jsonl');
  if (!existsSync(path)) return { n: 0, records: [] };
  const records = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
    const raw = JSON.parse(l) as Choice;
    return { ...raw, actor: raw.actor ?? 'unknown' as const, kind: raw.kind ?? 'selection' as const };
  }).filter((r) => all || r.actor === 'user');
  return { n: records.length, records };
}
