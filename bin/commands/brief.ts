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

/** `omd imagegen [--kind graphic|page|board|asset] --name <name> --prompt <...> [--reference <image>]... [--json]`: one generated image, kept with its prompt. */
export async function runImagegen(args: readonly string[]): Promise<never> {
  const opts = parseArgs(args.slice(1));
  const usage = 'usage: omd imagegen --name <section> --prompt "<claim, protagonist object, material, light, framing>" [--reference <kept image path>]... [--json]\n'
    + '       omd imagegen --kind page --name <section> --prompt "<exact copy, layout, type, graphic or proof and its place, palette>" [--viewport mobile] [--json]\n'
    + '       omd imagegen --kind board --name concept-<a> --prompt "<the product, its key screens with real content, palette, type, asset style>" [--reference .omd/studio/board.png] [--viewport mobile] [--json]\n'
    + '       omd imagegen --kind asset --name <set> --prompt "<the items, their one shared style, plain background>" [--reference <chosen concept board>] [--json]';
  if (opts.help) {
    console.log(`${usage}\n  Generates one image with the Codex CLI's image tool into .omd/ideas with its prompt. Page ideas and concept boards are drafts `
      + 'that never ship as a page image. A chosen asset or graphic candidate ships only through omd studio asset, which cuts it out and records its provenance.');
    process.exit(0);
  }
  const bag = opts as unknown as Record<string, unknown>;
  const name = bag.name, prompt = bag.prompt, reference = bag.reference, kind = bag.kind ?? 'graphic', viewport = bag.viewport ?? 'desktop';
  const { generateIdeaImage, IDEA_KINDS } = await import('../../core/design/idea-image.ts');
  if (typeof name !== 'string' || typeof prompt !== 'string' || !IDEA_KINDS.includes(kind as never) || opts._.length
    || (viewport !== 'desktop' && viewport !== 'mobile')) throw new Error(usage);
  const invocation = invocationFromActivation(opts, 'omd imagegen');
  const references = reference === undefined ? [] : (Array.isArray(reference) ? reference : [reference]).map(String);
  const result = generateIdeaImage(process.cwd(), projectWriter(invocation), { name, prompt, references, kind: kind as never, viewport });
  if (opts.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else console.log(result.kind === 'page' ? `page idea: ${result.path} (a draft; build the section in HTML on the design system)`
    : result.kind === 'board' ? `concept board: ${result.path} (a draft; set the boards side by side with omd studio sheet and choose one in .omd/studio/direction.json)`
      : result.kind === 'asset' ? `asset candidate: ${result.path} (set the candidates side by side with omd studio sheet, pick in .omd/studio/assets.json, ship with omd studio asset)`
        : `idea image: ${result.path} (build it in code, or ship the chosen one with omd studio asset)`);
  process.exit(0);
}
