import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { invocationFromActivation, projectWriter, type Opts } from '../cli/runtime.ts';
import type { ProjectWriteAdapter } from '../../core/runtime/project-write.ts';
import { archiveCycle, plannedArchive, projectRelative, snapshotBaseline } from '../../core/thin/archive.ts';
import { assemblePacket, COLD_EYE_QUESTION } from '../../core/thin/packet.ts';
import {
  appendMemo, beginCycle, put, cycleDir, closeCycle, eyeAnswerPath, eyeVerdict, goOn, newThinState, readThinState, requireThinState, resultDir,
  THIN_BEFORE, THIN_KINDS, THIN_MEMO, THIN_REFERENCE, ThinError, writeThinState, type ThinKind, type ThinState,
} from '../../core/thin/state.ts';

/** `omd thin`: the cycle mechanics of the thin design loop (state, memo, packet, archive). No stage records. */
const USAGE = [
  'usage: omd thin start --kind marketing|product|redesign --request "<request>" [--continue]',
  '       omd thin status [--json]',
  '       omd thin shoot <page|url> [--name <name>] [--reference | --before | --out <dir>] [--json]',
  '       omd thin refs <dribbble|behance|pinterest|https-url> "<one job>" [--json]',
  '       omd thin refs keep <image-url> --job "<one job>"',
  '       omd thin check <page|url>... [--json]',
  '       omd thin packet [--cycle <n>] [--json]',
  '       omd thin eye --prompt | --record "<the cold eye\'s answer, verbatim>"   (on Pi, omd thin eye --run asks it)',
  '       omd thin close [--keep <path>]... [--open "<how to open the result>"]',
  '       omd thin go [--continue] [--say "<what the human said>"]',
  '       omd thin begin [--json]',
].join('\n');

const FLAGS = new Set(['continue', 'json', 'prompt', 'run', 'help', 'reference', 'before']);
type Parsed = { _: string[]; flags: Set<string>; values: Map<string, string[]> };

function parse(args: readonly string[]): Parsed {
  const parsed: Parsed = { _: [], flags: new Set(), values: new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith('--')) { parsed._.push(arg); continue; }
    const name = arg.slice(2);
    if (FLAGS.has(name)) { parsed.flags.add(name); continue; }
    const value = args[index + 1];
    if (value === undefined) throw new ThinError(`--${name} needs a value\n${USAGE}`);
    parsed.values.set(name, [...parsed.values.get(name) ?? [], value]);
    index += 1;
  }
  return parsed;
}
/** Written before exit: a pipe on macOS drains asynchronously. */
const emit = (value: unknown): Promise<void> => new Promise(done => { process.stdout.write(`${JSON.stringify(value)}\n`, () => done()); });
const one = (parsed: Parsed, name: string): string | undefined => parsed.values.get(name)?.at(-1);

const count = (root: string, dir: string): number => existsSync(join(root, dir))
  ? readdirSync(join(root, dir)).filter(name => /\.(?:png|jpe?g|webp)$/i.test(name)).length : 0;

function firstLine(root: string, path: string): string | null {
  if (!existsSync(join(root, path))) return null;
  return readFileSync(join(root, path), 'utf8').trim().split('\n')[0]?.slice(0, 200) ?? null;
}

function phaseLine(state: ThinState): string {
  const mode = state.mode === 'continue' ? `continue, up to cycle ${state.until}` : 'one cycle at a time';
  const phase = state.phase === 'making' ? 'being made'
    : state.phase === 'next' ? 'closed; the next cycle starts in a fresh session'
      : `stopped (${state.reason === 'no-tell' ? 'the cold eye found no tell' : state.reason === 'cap' ? `cycle ${state.until} reached` : 'one cycle was asked for'})`;
  return `cycle ${state.cycle} (${mode}): ${phase}`;
}

function nextStep(state: ThinState): string {
  if (state.phase === 'making') return `make cycle ${state.cycle}; when done: captures into ${resultDir(state.cycle)}, omd thin packet, the cold eye, the memo, omd thin close`;
  if (state.phase === 'next') return 'in a fresh session, invoke the thin skill again: it runs omd thin begin and makes the next cycle';
  return 'show the human the result, the cold eye\'s finding and the memo; they reply "one more" (omd thin go) or "continue" (omd thin go --continue)';
}

function statusOf(root: string, state: ThinState) {
  const planned = plannedArchive(root, state.survivors);
  return {
    state, memo: THIN_MEMO, reference: { dir: THIN_REFERENCE, captures: count(root, THIN_REFERENCE) },
    ...(state.kind === 'redesign' ? { before: THIN_BEFORE } : {}),
    result: { dir: resultDir(state.cycle), captures: count(root, resultDir(state.cycle)) },
    eye: { path: eyeAnswerPath(state.cycle), verdict: eyeVerdict(root, state.cycle), firstLine: firstLine(root, eyeAnswerPath(state.cycle)) },
    nextCycleWouldArchive: planned.changed, nextCycleWouldRestore: planned.deleted,
    next: nextStep(state),
  };
}

async function printStatus(root: string, state: ThinState, json: boolean): Promise<void> {
  const status = statusOf(root, state);
  if (json) { await emit(status); return; }
  const archive = status.nextCycleWouldArchive;
  console.log([
    phaseLine(state),
    `request: ${state.request}`,
    `kind: ${state.kind}`,
    `memo: ${THIN_MEMO}`,
    `reference: ${THIN_REFERENCE} (${status.reference.captures} captures)`,
    ...(state.kind === 'redesign' ? [`before-state and behaviour contract: ${THIN_BEFORE}`] : []),
    `result captures: ${status.result.dir} (${status.result.captures})`,
    `cold eye: ${status.eye.firstLine === null ? `not asked yet (${status.eye.path})` : `${status.eye.path}: ${status.eye.firstLine}`}`,
    `surviving assets: ${state.survivors.length === 0 ? 'none named' : state.survivors.join(', ')}`,
    ...(state.open === undefined ? [] : [`open the result: ${state.open}`]),
    `the next cycle would archive ${archive.length} file${archive.length === 1 ? '' : 's'} and rebuild from the starting state${archive.length === 0 ? '' : `: ${archive.slice(0, 20).join(', ')}${archive.length > 20 ? ', ...' : ''}`}`,
    `next: ${status.next}`,
  ].join('\n'));
}

export async function runThin(args: readonly string[]): Promise<never> {
  const sub = args[1];
  const parsed = parse(args.slice(2));
  const root = process.cwd();
  const json = parsed.flags.has('json');
  const writer = (): ProjectWriteAdapter => projectWriter(invocationFromActivation({ _: [] } as Opts, `omd thin ${sub ?? ''}`));
  if (sub === undefined || sub === 'help' || parsed.flags.has('help')) { console.log(USAGE); process.exit(0); }

  if (sub === 'start') {
    const kind = one(parsed, 'kind');
    const request = one(parsed, 'request')?.trim();
    if (!THIN_KINDS.includes(kind as ThinKind) || !request) throw new ThinError(USAGE);
    if (readThinState(root) !== null) throw new ThinError('a thin loop already exists in this project; omd thin status says where it is');
    const write = writer();
    const baseline = snapshotBaseline(write);
    const state = writeThinState(write, newThinState({ request, kind: kind as ThinKind, continueMode: parsed.flags.has('continue') }));
    for (const dir of [THIN_REFERENCE, resultDir(1), ...(state.kind === 'redesign' ? [THIN_BEFORE] : [])]) write.mkdir(dir);
    appendMemo(write, `# Memo\n\nRequest: ${request}\n`);
    if (json) await emit({ state, baselineFiles: baseline.files });
    else console.log(`${phaseLine(state)}\nstarting state recorded (${baseline.files} files); a new cycle restarts from it\nnext: ${nextStep(state)}`);
    process.exit(0);
  }

  if (sub === 'eye') {
    if (parsed.flags.has('run')) {
      throw new ThinError('omd thin eye --run runs inside Pi (through omd_cli), on the session\'s own model. On Claude Code or Codex, spawn the omd-cold-eye agent with only the packet folder; any other reviewer can be given the packet folder and omd thin eye --prompt.');
    }
    const answer = one(parsed, 'record')?.trim();
    if (answer !== undefined) {
      if (!answer) throw new ThinError('--record needs the cold eye\'s answer');
      const path = eyeAnswerPath(requireThinState(root).cycle);
      put(writer(), path, `${answer}\n`);
      console.log(`saved to ${path}`);
      process.exit(0);
    }
    console.log(COLD_EYE_QUESTION);
    process.exit(0);
  }

  if (sub === 'check') {
    const targets = parsed._;
    if (targets.length === 0) throw new ThinError(USAGE);
    const { thinDefects } = await import('../../core/thin/check.ts');
    const lines: string[] = [];
    for (const target of targets) lines.push(...(await thinDefects(target)).map(line => `${target}: ${line}`));
    if (json) await emit({ defects: lines });
    else console.log(lines.length === 0 ? 'no defects found: no broken layout, no text off the edge, no dead control' : lines.join('\n'));
    process.exit(lines.length === 0 ? 0 : 1);
  }

  if (sub === 'shoot') {
    const target = parsed._[0];
    const out = one(parsed, 'out');
    if (target === undefined || parsed._.length !== 1) throw new ThinError(USAGE);
    const dir = parsed.flags.has('reference') ? THIN_REFERENCE : parsed.flags.has('before') ? THIN_BEFORE
      : out !== undefined ? projectRelative(root, out) : resultDir(requireThinState(root).cycle);
    const { shoot, slug } = await import('../../core/thin/capture.ts');
    const name = slug(one(parsed, 'name') ?? (/^https?:/.test(target) ? new URL(target).pathname.replace(/\/$/, '') || 'home' : target.replace(/\.html?$/i, '')));
    const files = await shoot(target, writer(), dir, name);
    if (json) await emit({ files });
    else console.log(`${files.join('\n')}\nlook at them before going on`);
    process.exit(0);
  }

  const state = requireThinState(root);
  if (sub === 'status') { await printStatus(root, state, json); process.exit(0); }

  if (sub === 'refs') {
    const dir = `${cycleDir(state.cycle)}/refs`;
    const capture = await import('../../core/thin/capture.ts');
    if (parsed._[0] === 'keep') {
      const url = parsed._[1];
      const job = one(parsed, 'job')?.trim();
      if (url === undefined || !job) throw new ThinError(USAGE);
      const file = await capture.keepImage(url, job, writer(), dir);
      console.log(`kept ${file} for: ${job}`);
      process.exit(0);
    }
    const [source, query] = parsed._;
    if (source === undefined || query === undefined) throw new ThinError(USAGE);
    const found = await capture.searchGallery(source, query, writer(), dir);
    if (json) await emit(found);
    else console.log([`${found.file}: the results of ${found.url}, as one image; look at it`,
      ...found.items.slice(0, 16).map(item => `  ${item.image}${item.link === null ? '' : `  (${item.link})`}`),
      'keep the few that each serve one job: omd thin refs keep <image-url> --job "<the job>"'].join('\n'));
    process.exit(0);
  }

  if (sub === 'packet') {
    const cycle = one(parsed, 'cycle') === undefined ? state.cycle : Number(one(parsed, 'cycle'));
    if (!Number.isSafeInteger(cycle) || cycle < 1 || cycle > state.cycle) throw new ThinError(`--cycle must be 1..${state.cycle}`);
    const packet = assemblePacket(writer(), cycle);
    if (json) await emit(packet);
    else console.log([`cold-eye packet: ${packet.dir} (${packet.result.length} result, ${packet.reference.length} reference images, nothing else)`,
      ...(packet.reference.length === 0 ? [`no reference captures in ${THIN_REFERENCE}: the eye looks without a measure`] : []),
      `answer goes verbatim to ${eyeAnswerPath(cycle)}`].join('\n'));
    process.exit(0);
  }

  if (sub === 'close') {
    const survivors = (parsed.values.get('keep') ?? []).map(path => {
      const relative = projectRelative(root, path);
      if (!existsSync(join(root, relative))) throw new ThinError(`--keep ${path} does not exist`);
      return relative;
    });
    const verdict = eyeVerdict(root, state.cycle);
    const closed = writeThinState(writer(), closeCycle(state, verdict, { survivors, open: one(parsed, 'open') }));
    if (!json && verdict === 'missing') console.log(`no cold-eye answer at ${eyeAnswerPath(state.cycle)}; closed without one`);
    await printStatus(root, closed, json);
    process.exit(0);
  }

  if (sub === 'go') {
    const said = one(parsed, 'say')?.trim();
    const write = writer();
    const next = writeThinState(write, goOn(state, parsed.flags.has('continue')));
    appendMemo(write, `\nHuman, after cycle ${state.cycle}: ${said || (parsed.flags.has('continue') ? 'continue' : 'one more')}\n`);
    await printStatus(root, next, json);
    process.exit(0);
  }

  if (sub === 'begin') {
    const next = beginCycle(state);
    const write = writer();
    const archive = archiveCycle(write, state.cycle, state.survivors);
    const begun = writeThinState(write, next);
    write.mkdir(resultDir(begun.cycle));
    const carried = [THIN_MEMO, THIN_REFERENCE, ...begun.survivors, ...(begun.kind === 'redesign' ? [THIN_BEFORE] : [])];
    if (json) await emit({ state: begun, archive, carried });
    else console.log([phaseLine(begun),
      `cycle ${state.cycle} archived to ${archive.dir} (${archive.archived.length} files; never read it), starting state restored`,
      ...(archive.unrestorable.length === 0 ? [] : [`could not restore (too large for the baseline): ${archive.unrestorable.join(', ')}`]),
      `carried: ${carried.join(', ')}`,
      `next: ${nextStep(begun)}`].join('\n'));
    process.exit(0);
  }

  throw new ThinError(USAGE);
}
