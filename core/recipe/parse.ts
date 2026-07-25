// Parses a recipe knowledge-pack document into its extractable code.
//
// The recipes under `core/motion/recipes/`, `core/interaction/recipes/`, and `core/composition/`
// are not prose: each carries 4–16 fenced code blocks under a fixed section structure
// (`## Parameters` + `## Implementation` are universal; motion recipes add `## React` and
// `## Reduced-motion variant`; interaction recipes add `## Non-canvas fallback`; composition
// recipes add `## Responsive behavior`). Until now a build had to READ that document and
// reimplement it, which is exactly the "seeing is not building" gap that ships static pages.
//
// This module turns the document into structured code so `materialize.ts` can write real files.
// It is a pure parser: no filesystem, no network, no stack opinions.

export type RecipeFamily = 'motion' | 'interaction' | 'composition';

/** Sections whose fenced code is production material (as opposed to prose or commentary). */
export const CODE_SECTIONS = [
  'Parameters',
  'Implementation',
  'React',
  'Reduced-motion variant',
  'Non-canvas fallback',
  'WebGL escalation',
  'Responsive behavior',
] as const;

export type CodeSection = (typeof CODE_SECTIONS)[number];

export type RecipeFence = {
  /** Fence language tag: css | js | tsx | html | glsl | text. */
  readonly lang: string;
  readonly code: string;
  /** The `## ` section the fence appeared under. */
  readonly section: string;
};

export type ParsedRecipe = {
  readonly name: string;
  readonly family: RecipeFamily;
  /** The `# ` title line. */
  readonly title: string;
  readonly fences: readonly RecipeFence[];
  /** Bare (non-relative) module specifiers imported by js/tsx fences. */
  readonly deps: readonly string[];
};

export class RecipeParseError extends Error {
  override readonly name = 'RecipeParseError';
  readonly reason: string;
  constructor(reason: string) {
    super(`recipe cannot be parsed: ${reason}`);
    this.reason = reason;
  }
}

const FENCE_OPEN = /^```([a-z]*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const HEADING = /^##\s+(.+?)\s*$/;
const TITLE = /^#\s+(.+?)\s*$/;
const BARE_IMPORT = /\bfrom\s+['"]([^'".][^'"]*)['"]/g;

/** Collects bare npm specifiers (`framer-motion`, `react`), never relative or absolute paths. */
function collectDeps(fences: readonly RecipeFence[]): string[] {
  const deps = new Set<string>();
  for (const fence of fences) {
    if (fence.lang !== 'js' && fence.lang !== 'tsx' && fence.lang !== 'ts') continue;
    for (const match of fence.code.matchAll(BARE_IMPORT)) {
      const specifier = match[1]!;
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
      // Scoped and plain packages only; strip any deep import path.
      const parts = specifier.split('/');
      deps.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!);
    }
  }
  return [...deps].sort();
}

/**
 * Parses one recipe markdown document. Throws `RecipeParseError` when the document has no title
 * or carries no fenced code at all (a recipe with nothing to install is a documentation bug).
 */
export function parseRecipe(markdown: string, name: string, family: RecipeFamily): ParsedRecipe {
  if (typeof markdown !== 'string' || markdown.trim() === '') throw new RecipeParseError(`${name} is empty`);
  const lines = markdown.split('\n');
  let title = '';
  let section = '';
  let open: { lang: string; buffer: string[]; section: string } | null = null;
  const fences: RecipeFence[] = [];

  for (const line of lines) {
    if (open) {
      if (FENCE_CLOSE.test(line)) {
        fences.push({ lang: open.lang, code: open.buffer.join('\n'), section: open.section });
        open = null;
      } else {
        open.buffer.push(line);
      }
      continue;
    }
    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      open = { lang: fence[1] || 'text', buffer: [], section };
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      section = heading[1]!;
      continue;
    }
    if (title === '') {
      const titleMatch = TITLE.exec(line);
      if (titleMatch) title = titleMatch[1]!;
    }
  }

  if (open) throw new RecipeParseError(`${name} has an unterminated code fence`);
  if (title === '') throw new RecipeParseError(`${name} has no title heading`);
  if (fences.length === 0) throw new RecipeParseError(`${name} carries no code to install`);

  return { name, family, title, fences, deps: collectDeps(fences) };
}

/** Fences from the named sections only, in document order. */
export function fencesFrom(recipe: ParsedRecipe, sections: readonly string[], lang: string): RecipeFence[] {
  const wanted = new Set(sections);
  return recipe.fences.filter((fence) => fence.lang === lang && wanted.has(fence.section));
}
