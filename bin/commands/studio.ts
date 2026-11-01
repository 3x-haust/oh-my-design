import { relative } from 'node:path';
import { invocationFromActivation, parseArgs, projectWriter, type Opts } from '../cli/runtime.ts';

async function cmdStudioConcepts(opts: Opts): Promise<never> {
  const invocation = invocationFromActivation(opts, 'omd studio concepts');
  const writer = projectWriter(invocation);
  const { renderStudioConcepts } = await import('../../core/design/studio.ts');
  const { renderPage } = await import('../../core/render/index.ts');
  const rendered = await renderStudioConcepts(process.cwd(), writer, async (page, viewport, out) => {
    await renderPage(page, { viewport, out, adapter: writer });
  });
  if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(rendered), () => done()));
  else {
    for (const concept of rendered.concepts) {
      console.log(`${concept.name}: ${concept.captures.map(capture => relative(process.cwd(), capture.path)).join(', ')}`);
    }
    console.log(`record: ${rendered.path}`);
  }
  process.exit(0);
}

export async function runStudio(args: string[]): Promise<never> {
  const sub = args[1];
  if (args.includes('--help')) {
    console.log('omd studio concepts [--json]   render every .omd/studio/concepts/<name>/index.html at desktop and mobile');
    process.exit(0);
  }
  if (sub === 'concepts') return cmdStudioConcepts(parseArgs(args.slice(2)));
  throw new Error(`unknown command studio${sub ? ` ${sub}` : ''}; run omd help`);
}
