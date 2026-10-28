import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathsOutsideScope } from '../route/adaptive-route-record.ts';

type Route = Parameters<typeof pathsOutsideScope>[0];
type Scoped = Pick<Route, 'allowedPaths'>;

const SOURCE = /\.(?:[cm]?[jt]sx?|css|scss|html|json)$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.omd', '.git', 'public', 'coverage']);
const GENERATED = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|[^/]*\.min\.[a-z]+)$/;

/**
 * Hand-authored source the route lets the agent write, packed onto a few long lines the way a minifier
 * would leave it. Generated output, lock files and copied assets are not authored source.
 */
export function unreadableSources(root: string, route: Scoped): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name)); continue; }
      const path = relative(root, join(directory, entry.name)).split('\\').join('/');
      if (entry.isFile() && SOURCE.test(path) && !GENERATED.test(path)) files.push(path);
    }
  };
  walk(root);
  return files.filter(path => pathsOutsideScope(route as Route, [path]).length === 0).filter(path => {
    const lines = readFileSync(join(root, path), 'utf8').split('\n').filter(line => line.trim());
    // A manifest or config object written as one line (package.json, tsconfig.json) is packed too.
    if (path.endsWith('.json') && lines.length === 1 && lines[0]!.length > 120) return true;
    if (statSync(join(root, path)).size < 600) return false;
    const longest = Math.max(...lines.map(line => line.length));
    const average = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    return longest > 400 && average > 160;
  });
}

export function requireReadableSource(root: string, route: Scoped): void {
  const packed = unreadableSources(root, route);
  if (!packed.length) return;
  const error = new Error(`SOURCE_NOT_READABLE: ${packed.join(', ')} ${packed.length === 1 ? 'is' : 'are'} packed onto long lines. `
    + 'Write source a reviewer can read: one declaration or rule per line, formatted the way the project\'s formatter would leave it (omd pack guides/code.md).');
  Object.defineProperty(error, 'code', { value: 'SOURCE_NOT_READABLE', enumerable: true });
  throw error;
}

const COMPONENT = /^(?:export\s+)?(?:default\s+)?(?:function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=\s*(?:\(|memo\(|forwardRef\(|React\.))/;
const TEST_RUNNERS = ['vitest', 'jest', '@testing-library/react', '@playwright/test'];

/** React source files carrying several screen parts at length instead of one component each. */
export function crowdedComponentFiles(root: string, route: Scoped): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name)); continue; }
      const path = relative(root, join(directory, entry.name)).split('\\').join('/');
      if (entry.isFile() && /\.[jt]sx$/.test(path) && !/\.test\.[jt]sx$/.test(path)) files.push(path);
    }
  };
  walk(root);
  return files.filter(path => pathsOutsideScope(route as Route, [path]).length === 0).filter(path => {
    const lines = readFileSync(join(root, path), 'utf8').split('\n');
    return lines.length > 80 && lines.filter(line => COMPONENT.test(line)).length > 3;
  });
}

/** A new React project's test script must run a runner that renders or drives the components. */
export function missingBehaviorTests(root: string): string | null {
  let manifest: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try { manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { return null; }
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (dependencies.react === undefined) return null;
  if (!manifest.scripts?.test) return 'package.json has no test script';
  return TEST_RUNNERS.some(name => dependencies[name] !== undefined) ? null
    : `the test script runs no component test runner (${TEST_RUNNERS.join(', ')})`;
}

/**
 * A new project is written for review: readable files, one component per file, and tests that exercise
 * behavior. Existing projects keep their own conventions, so only the readability check applies to them.
 */
export function requireReviewableSource(root: string, route: Scoped & Pick<Route, 'projectMode'>,
  stage: 'first-render' | 'completion' = 'completion'): void {
  requireReadableSource(root, route);
  if (route.projectMode !== 'greenfield') return;
  const crowded = crowdedComponentFiles(root, route);
  // Tests may still be in progress at the first render; completion requires them.
  const tests = stage === 'completion' ? missingBehaviorTests(root) : null;
  if (!crowded.length && tests === null) return;
  const error = new Error(`SOURCE_NOT_REVIEWABLE: ${[
    ...(crowded.length ? [`${crowded.join(', ')} hold${crowded.length === 1 ? 's' : ''} several components; give each section or reusable part its own file with its styles beside it (omd pack guides/code.md)`] : []),
    ...(tests === null ? [] : [`${tests}; test rendered behavior (for example Vitest with Testing Library), not the source text`]),
  ].join('. ')}.`);
  Object.defineProperty(error, 'code', { value: 'SOURCE_NOT_REVIEWABLE', enumerable: true });
  throw error;
}
