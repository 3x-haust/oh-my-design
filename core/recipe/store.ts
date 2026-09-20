// Locates recipe documents inside the installed knowledge pack and installs materialized files.
//
// The pack ships with OMD (`omd pack dir`), so nothing here reaches the network or a third-party
// registry: the assets are OMD's own, versioned with the plugin.

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseRecipe, type ParsedRecipe, type RecipeFamily } from './parse.ts';
import { materializeRecipe, type MaterializeResult, type Stack } from './materialize.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';

/** Pack-relative directory for each recipe family. */
export const FAMILY_DIRS: Readonly<Record<RecipeFamily, string>> = {
  motion: 'motion/recipes',
  interaction: 'interaction/recipes',
  composition: 'composition',
};

export type RecipeRef = { readonly name: string; readonly family: RecipeFamily; readonly path: string };

export class RecipeNotFoundError extends Error {
  override readonly name = 'RecipeNotFoundError';
  constructor(name: string) {
    super(`no recipe named ${name}; run \`omd recipe list\` to see what ships with this build`);
  }
}

/** Every recipe in the pack, sorted by family then name. */
export function listRecipes(packRoot: string): RecipeRef[] {
  const refs: RecipeRef[] = [];
  for (const family of Object.keys(FAMILY_DIRS) as RecipeFamily[]) {
    const dir = join(packRoot, FAMILY_DIRS[family]);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.md')) continue;
      refs.push({ name: file.slice(0, -3), family, path: join(dir, file) });
    }
  }
  return refs;
}

export function findRecipe(packRoot: string, name: string): RecipeRef {
  const ref = listRecipes(packRoot).find((r) => r.name === name);
  if (!ref) throw new RecipeNotFoundError(name);
  return ref;
}

function recipeBytes(packRoot: string, ref: RecipeRef): Buffer {
  const root = realpathSync(packRoot);
  const source = realpathSync(ref.path);
  const fromPack = relative(root, source);
  const stat = lstatSync(source);
  if (!fromPack || fromPack.startsWith('../') || isAbsolute(fromPack) || !stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`recipe source must be a regular file inside the installed pack: ${ref.name}`);
  }
  return readFileSync(source);
}

export function loadRecipe(packRoot: string, name: string): ParsedRecipe {
  const ref = findRecipe(packRoot, name);
  return parseRecipe(recipeBytes(packRoot, ref).toString('utf8'), ref.name, ref.family);
}

export type InstallResult = MaterializeResult & {
  readonly written: readonly string[];
  readonly recipeSha256: string;
  readonly materializedSha256: string;
};

function canonicalOutputDirectory(input: string): string {
  const unresolved: string[] = [];
  let existing = resolve(input);
  while (!existsSync(existing)) {
    unresolved.unshift(basename(existing));
    const parent = dirname(existing);
    if (parent === existing) throw new Error(`recipe output has no existing ancestor: ${input}`);
    existing = parent;
  }
  return join(realpathSync(existing), ...unresolved);
}

/**
 * Materializes a recipe and writes its files under `outDir`. Returns the absolute paths written
 * alongside the dependency and note list, so the caller can report exactly what landed.
 */
export function installRecipe(
  packRoot: string,
  name: string,
  opts: {
    readonly stack: Stack; readonly outDir: string; readonly writer: ProjectWriteAdapter;
    /** All actual destinations, checked once before any source write. A thrown error aborts. */
    readonly beforeWrite?: (targets: readonly string[]) => void;
  },
): InstallResult {
  const ref = findRecipe(packRoot, name);
  const source = recipeBytes(packRoot, ref);
  const recipe = parseRecipe(source.toString('utf8'), ref.name, ref.family);
  const result = materializeRecipe(recipe, { stack: opts.stack });
  const writer = requireProjectWriteAdapter(opts.writer.projectRoot, opts.writer);
  const dir = canonicalOutputDirectory(opts.outDir);
  const fromProject = relative(writer.projectRoot, dir);
  if (fromProject === '..' || fromProject.startsWith('../') || isAbsolute(fromProject)) {
    throw new Error(`recipe output must stay under the guarded project root: ${writer.projectRoot}`);
  }
  opts.beforeWrite?.(Object.freeze(result.files.map(file => resolve(dir, file.path))));
  const written = result.files.map((file) => writer.write(join(fromProject, file.path), file.contents));
  for (const [index, materialized] of result.files.entries()) {
    const target = resolve(dir, materialized.path);
    if (written[index] !== target || !readFileSync(target).equals(Buffer.from(materialized.contents))) {
      throw new Error(`recipe install did not materialize exact source bytes: ${materialized.path}`);
    }
  }
  const materializedSha256 = createHash('sha256').update(JSON.stringify(result.files.map((file) => ({
    path: file.path,
    sha256: createHash('sha256').update(file.contents).digest('hex'),
  })))).digest('hex');
  return {
    ...result,
    written,
    recipeSha256: createHash('sha256').update(source).digest('hex'),
    materializedSha256,
  };
}
