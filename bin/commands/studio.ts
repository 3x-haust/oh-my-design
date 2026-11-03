import { invocationFromActivation, parseArgs, projectWriter, type Opts } from '../cli/runtime.ts';

async function cmdStudioRefs(opts: Opts): Promise<never> {
  const urls = opts._.map(String);
  if (urls.length === 0) throw new Error('usage: omd studio refs <url> [<url> ...] [--json]');
  const writer = projectWriter(invocationFromActivation(opts, 'omd studio refs'));
  const { studyStudioReferences } = await import('../../core/design/studio.ts');
  const result = await studyStudioReferences(writer, urls);
  if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(result), () => done()));
  else {
    for (const item of result.studied) console.log(`${item.url}: ${item.dir} (${item.screens} screens, ${item.sections} sections, weights ${item.weights.join('/')})`);
    for (const item of result.skipped) console.log(`skipped ${item.url}: ${item.reason}`);
  }
  process.exit(result.studied.length > 0 ? 0 : 1);
}

async function cmdStudioCheck(opts: Opts): Promise<never> {
  const page = typeof opts.page === 'string' ? opts.page : 'dist/index.html';
  const { observeSystemDrift, readStudioSystem, studioReferenceDepth, systemDriftFailures, STUDIO_SYSTEM_GUIDANCE } = await import('../../core/design/studio.ts');
  const system = readStudioSystem(process.cwd());
  if (system === null) throw new Error(`STUDIO_SYSTEM_MISSING: no system is written yet. ${STUDIO_SYSTEM_GUIDANCE}`);
  const observations = await observeSystemDrift(page, system);
  const failures = systemDriftFailures(observations, studioReferenceDepth(process.cwd()));
  if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify({ page, system, observations, failures }), () => done()));
  else console.log(failures.length === 0 ? `${page} holds the system` : failures.join('\n'));
  process.exit(failures.length === 0 ? 0 : 1);
}

export async function runStudio(args: string[]): Promise<never> {
  const sub = args[1];
  if (args.includes('--help')) {
    console.log('omd studio refs <url> [<url> ...] [--json]   study finished sites: first screen, whole page, section crops and their measured system\n'
      + 'omd studio check [--page <file>] [--json]   measure the page against .omd/studio/system.json (sizes, weights, arrows, player chrome)');
    process.exit(0);
  }
  if (sub === 'refs') return cmdStudioRefs(parseArgs(args.slice(2)));
  if (sub === 'check') return cmdStudioCheck(parseArgs(args.slice(2)));
  throw new Error(`unknown command studio${sub ? ` ${sub}` : ''}; run omd help`);
}
