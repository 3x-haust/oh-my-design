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

/** `omd imagegen [--kind page] --name <section> --prompt <idea> [--reference <kept image>]... [--json]`: an idea image, never shipped. */
export async function runImagegen(args: readonly string[]): Promise<never> {
  const opts = parseArgs(args.slice(1));
  const usage = 'usage: omd imagegen --name <section> --prompt "<claim, protagonist object, material, light, framing>" [--reference <kept image path>]... [--json]\n'
    + '       omd imagegen --kind page --name <section> --prompt "<exact copy, layout, type, graphic or proof and its place, palette>" [--viewport mobile] [--json]';
  if (opts.help) {
    console.log(`${usage}\n  Generates one idea image with the Codex CLI into .omd/ideas; ideation only. A graphic idea guides a graphic built in code; `
      + 'a page idea (--kind page) drafts one section\'s composition before the page is built in HTML.');
    process.exit(0);
  }
  const bag = opts as unknown as Record<string, unknown>;
  const name = bag.name, prompt = bag.prompt, reference = bag.reference, kind = bag.kind ?? 'graphic', viewport = bag.viewport ?? 'desktop';
  if (typeof name !== 'string' || typeof prompt !== 'string' || (kind !== 'graphic' && kind !== 'page') || opts._.length
    || (viewport !== 'desktop' && viewport !== 'mobile')) throw new Error(usage);
  const page = kind === 'page';
  const invocation = invocationFromActivation(opts, 'omd imagegen');
  const { generateIdeaImage } = await import('../../core/design/idea-image.ts');
  const references = reference === undefined ? [] : (Array.isArray(reference) ? reference : [reference]).map(String);
  const result = generateIdeaImage(process.cwd(), projectWriter(invocation), { name, prompt, references, kind: page ? 'page' : 'graphic', viewport });
  if (opts.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else console.log(page ? `page idea: ${result.path} (ideation only; build the section in HTML on the design system)`
    : `idea image: ${result.path} (ideation only; build the graphic in code and render it with omd render --graphic)`);
  process.exit(0);
}
