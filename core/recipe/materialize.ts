// Turns a parsed recipe into real source files a project can compile.
//
// This is the answer to the harness's central failure: a build that must REIMPLEMENT a technique
// from a document reliably degrades into a static approximation (Design2Code measured exactly this:
// models lag most at recalling visual elements and generating correct layout). Installing removes
// the reimplementation step — the technique arrives as working source, and the build's remaining job
// is the one it is actually good at: binding this project's content and tokens into it.
//
// Pure: takes a `ParsedRecipe`, returns file contents. The caller writes them.

import { fencesFrom, type ParsedRecipe } from './parse.ts';

export type Stack = 'react' | 'vanilla';

export type MaterializedFile = {
  /** Path relative to the chosen output directory. */
  readonly path: string;
  readonly contents: string;
};

export type MaterializeResult = {
  readonly files: readonly MaterializedFile[];
  /** Bare npm specifiers the emitted files import; the caller installs them. */
  readonly deps: readonly string[];
  /** Human-readable facts about what was and was not emitted. */
  readonly notes: readonly string[];
};

/** CSS comes from the parameter block, the implementation, and every variant that overrides it. */
const CSS_SECTIONS = ['Parameters', 'Implementation', 'Reduced-motion variant', 'Non-canvas fallback', 'Responsive behavior'] as const;
const JS_SECTIONS = ['Implementation', 'Reduced-motion variant', 'Non-canvas fallback', 'WebGL escalation'] as const;
const TSX_SECTIONS = ['React'] as const;
const HTML_SECTIONS = ['Implementation', 'Non-canvas fallback', 'Responsive behavior'] as const;

export class MaterializeError extends Error {
  override readonly name = 'MaterializeError';
  readonly reason: string;
  constructor(reason: string) {
    super(`recipe cannot be materialized: ${reason}`);
    this.reason = reason;
  }
}

function banner(recipe: ParsedRecipe, comment: 'block' | 'line'): string {
  const source = `core/${recipe.family === 'composition' ? 'composition' : `${recipe.family}/recipes`}/${recipe.name}.md`;
  const lines = [
    `${recipe.title} — installed by \`omd recipe add ${recipe.name}\`.`,
    `Source of truth: ${source}. Tune the custom properties; keep the reduced-motion branch.`,
  ];
  return comment === 'block'
    ? `/*\n${lines.map((l) => ` * ${l}`).join('\n')}\n */\n`
    : `${lines.map((l) => `// ${l}`).join('\n')}\n`;
}

const join = (blocks: readonly string[]): string => blocks.map((b) => b.trimEnd()).filter(Boolean).join('\n\n');

/**
 * Emits the installable files for a recipe on the requested stack.
 *
 * - CSS is always emitted when the recipe has any (parameters + implementation + variants), because
 *   the custom properties are the recipe's tuning surface on every stack.
 * - `vanilla` additionally emits the JS implementation; `react` emits the TSX component.
 * - A `react` request for a recipe with no React section falls back to the vanilla pair and says so,
 *   rather than inventing a component that was never written.
 * - Composition recipes emit their HTML structure reference.
 *
 * Throws `MaterializeError` when the recipe yields no file at all on the requested stack.
 */
export function materializeRecipe(recipe: ParsedRecipe, opts: { readonly stack: Stack }): MaterializeResult {
  const notes: string[] = [];
  const files: MaterializedFile[] = [];

  const css = fencesFrom(recipe, CSS_SECTIONS, 'css').map((f) => f.code);
  if (css.length > 0) {
    files.push({ path: `${recipe.name}.css`, contents: `${banner(recipe, 'block')}\n${join(css)}\n` });
  }

  const tsx = fencesFrom(recipe, TSX_SECTIONS, 'tsx').map((f) => f.code);
  const js = fencesFrom(recipe, JS_SECTIONS, 'js').map((f) => f.code);

  if (opts.stack === 'react') {
    if (tsx.length > 0) {
      files.push({ path: `${recipe.name}.tsx`, contents: `${banner(recipe, 'line')}\n${join(tsx)}\n` });
    } else if (js.length > 0) {
      files.push({ path: `${recipe.name}.js`, contents: `${banner(recipe, 'line')}\n${join(js)}\n` });
      notes.push(`${recipe.name} has no React section; emitted the framework-free implementation instead of inventing a component.`);
    }
  } else if (js.length > 0) {
    files.push({ path: `${recipe.name}.js`, contents: `${banner(recipe, 'line')}\n${join(js)}\n` });
  } else if (tsx.length > 0) {
    notes.push(`${recipe.name} ships only a React implementation; install it on the react stack.`);
  }

  if (recipe.family === 'composition') {
    const html = fencesFrom(recipe, HTML_SECTIONS, 'html').map((f) => f.code);
    if (html.length > 0) {
      files.push({ path: `${recipe.name}.html`, contents: `<!-- ${recipe.title} — structure reference installed by omd recipe add ${recipe.name} -->\n${join(html)}\n` });
    }
  }

  if (files.length === 0) throw new MaterializeError(`${recipe.name} yields no file on the ${opts.stack} stack`);

  // Only the emitted files' dependencies matter: a vanilla install must not demand React packages.
  const emittedReact = files.some((f) => f.path.endsWith('.tsx'));
  const deps = emittedReact ? [...recipe.deps] : recipe.deps.filter((d) => d !== 'react' && d !== 'framer-motion' && d !== 'motion');
  if (deps.length > 0) notes.push(`requires: ${deps.join(', ')}`);

  return { files, deps, notes };
}
