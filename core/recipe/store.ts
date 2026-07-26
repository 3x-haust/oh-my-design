// Locates recipe documents inside the installed knowledge pack and installs materialized files.
//
// The pack ships with OMD (`omd pack dir`), so nothing here reaches the network or a third-party
// registry: the assets are OMD's own, versioned with the plugin.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseRecipe, type ParsedRecipe, type RecipeFamily } from './parse.ts';
import { materializeRecipe, type MaterializeResult, type Stack } from './materialize.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

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

export function loadRecipe(packRoot: string, name: string): ParsedRecipe {
  const ref = findRecipe(packRoot, name);
  return parseRecipe(readFileSync(ref.path, 'utf8'), ref.name, ref.family);
}

export type InstallResult = MaterializeResult & { readonly written: readonly string[] };

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
  opts: { readonly stack: Stack; readonly outDir: string; readonly writer: ProjectWriteAdapter },
): InstallResult {
  const recipe = loadRecipe(packRoot, name);
  const result = materializeRecipe(recipe, { stack: opts.stack });
  const dir = canonicalOutputDirectory(opts.outDir);
  const fromProject = relative(opts.writer.projectRoot, dir);
  if (fromProject === '..' || fromProject.startsWith('../') || isAbsolute(fromProject)) {
    throw new Error(`recipe output must stay under the guarded project root: ${opts.writer.projectRoot}`);
  }
  const written = result.files.map((file) => opts.writer.write(join(fromProject, file.path), file.contents));
  return { ...result, written };
}
