import { inputJson, invocationFromActivation, parseArgs, projectWriter } from '../cli/runtime.ts';

/** `omd brief --input <json> [--json]`: publish the design brief for a new surface. */
export async function runBrief(args: readonly string[]): Promise<never> {
  const opts = parseArgs(args.slice(1));
  if (opts.help) {
    console.log('usage: omd brief --input <design-brief.json> [--json]\n  Records the design brief for a new surface; get the skeleton with omd schema design-brief.');
    process.exit(0);
  }
  if (!opts.input || opts._.length) throw new Error('usage: omd brief --input <design-brief.json> [--json]; get the skeleton with omd schema design-brief');
  const invocation = invocationFromActivation(opts, 'omd brief');
  const { publishDesignBrief } = await import('../../core/design/design-brief.ts');
  const brief = publishDesignBrief(inputJson(opts.input, 'omd brief'), projectWriter(invocation), process.cwd());
  if (opts.json) process.stdout.write(`${JSON.stringify({ path: '.omd/brief.json', brief })}\n`);
  else console.log(`brief recorded: ${brief.sections.length} sections, ${brief.cut.length} cut; message: ${brief.message}`);
  process.exit(0);
}

/** `omd scaffold [--json]`: start a new React + Vite + TypeScript project from the official template. */
export async function runScaffold(args: readonly string[]): Promise<never> {
  const opts = parseArgs(args.slice(1));
  if (opts.help) {
    console.log('usage: omd scaffold [--json]\n  Starts a new React + Vite + strict TypeScript project from the official template: it runs in a temporary '
      + 'folder and copies only the files the route allows, never replacing or deleting anything.');
    process.exit(0);
  }
  if (opts._.length) throw new Error('usage: omd scaffold [--json]');
  const invocation = invocationFromActivation(opts, 'omd scaffold');
  const { readPersistedRoute } = await import('../../core/route/index.ts');
  const { scaffoldReactProject } = await import('../../core/design/react-scaffold.ts');
  const route = readPersistedRoute(process.cwd(), invocation);
  const result = scaffoldReactProject(process.cwd(), route, projectWriter(invocation));
  const { motionRequired } = await import('../../core/design/new-surface-advisories.ts');
  // A landing's section graphics are lit three.js objects rendered to images.
  const next = `npm install${motionRequired(route) ? ', npm install three' : ''}, then npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom prettier; `
    + 'replace the template demo (App.tsx, App.css, assets) with the page, structured per omd pack guides/code.md';
  if (opts.json) process.stdout.write(`${JSON.stringify({ ...result, next })}\n`);
  else {
    console.log(`scaffolded ${result.template}: ${result.written.length} files written`);
    for (const path of result.kept) console.log(`  kept existing ${path}`);
    for (const path of result.outsideScope) console.log(`  skipped outside route scope ${path}`);
    console.log(`next: ${next}`);
  }
  process.exit(0);
}

/** `omd imagegen [--kind page] --name <section> --prompt <idea> [--reference <kept image>]... [--json]`: an idea image, never shipped. */
export async function runImagegen(args: readonly string[]): Promise<never> {
  const opts = parseArgs(args.slice(1));
  const usage = 'usage: omd imagegen --name <section> --prompt "<claim, protagonist object, material, light, framing>" [--reference <kept image path>]... [--json]\n'
    + '       omd imagegen --kind page --name <section> --prompt "<exact copy, layout, type, graphic or proof and its place, palette>" [--json]';
  if (opts.help) {
    console.log(`${usage}\n  Generates one idea image with the Codex CLI into .omd/ideas; ideation only. A graphic idea guides a graphic built in code; `
      + 'a page idea (--kind page) drafts one section\'s composition before the page is built in HTML.');
    process.exit(0);
  }
  const bag = opts as unknown as Record<string, unknown>;
  const name = bag.name, prompt = bag.prompt, reference = bag.reference, kind = bag.kind ?? 'graphic';
  if (typeof name !== 'string' || typeof prompt !== 'string' || (kind !== 'graphic' && kind !== 'page') || opts._.length) throw new Error(usage);
  const page = kind === 'page';
  const invocation = invocationFromActivation(opts, 'omd imagegen');
  const { generateIdeaImage } = await import('../../core/design/idea-image.ts');
  const references = reference === undefined ? [] : (Array.isArray(reference) ? reference : [reference]).map(String);
  const result = generateIdeaImage(process.cwd(), projectWriter(invocation), { name, prompt, references, kind: page ? 'page' : 'graphic' });
  if (opts.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else console.log(page ? `page idea: ${result.path} (ideation only; build the section in HTML on the design system)`
    : `idea image: ${result.path} (ideation only; build the graphic in code and render it with omd render --graphic)`);
  process.exit(0);
}
