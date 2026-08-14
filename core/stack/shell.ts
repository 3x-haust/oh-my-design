import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the interface this run designs actually runs.
 *
 * An Electron or Tauri app is a web UI, so every rendering, IR, probe, and review tool works
 * unchanged — but it is not a website. Treating it as one is how a desktop run ends up chasing SEO,
 * no-JS survival, landing conversion, and "the web version", none of which exist. The shell is
 * measured from the repository so no role has to guess, and so the gates that cannot apply are
 * named instead of silently failing.
 */
export type ShellKind = 'electron' | 'tauri' | 'browser';

export type AppShell = {
  readonly kind: ShellKind;
  /** Evidence that decided it, so a wrong answer is arguable rather than mysterious. */
  readonly evidence: readonly string[];
  /** The renderer's dev-server URL when the shell serves one. */
  readonly devUrl: string | null;
  /** Built renderer entry, relative to the project root. Renders without a server. */
  readonly builtEntry: string | null;
  /** True when `builtEntry` exists right now. */
  readonly builtEntryExists: boolean;
  /** Command that produces `builtEntry`. */
  readonly buildCommand: string | null;
  /** Command that serves `devUrl`. */
  readonly devCommand: string | null;
  /** Checks that are meaningless for this shell and must not be run or reported as failures. */
  readonly inapplicableChecks: readonly string[];
};

/**
 * Globals the preload script exposes to the renderer.
 *
 * Outside its shell the renderer boots with none of them, so an app that reads `window.<name>` at
 * startup paints a boot error instead of its UI. That error screen is not a design defect, and a
 * review that receives it is reviewing the harness. Read from the built preload rather than
 * guessed, so the diagnostic is evidence or it is silent.
 */
export function bridgeGlobals(cwd: string, shell: AppShell): readonly string[] {
  if (shell.kind !== 'electron') return [];
  const preload = firstExisting(cwd, ['out/preload/index.js', 'dist/preload/index.js', 'out/preload/index.mjs']);
  if (preload === null) return [];
  try {
    const body = readFileSync(join(cwd, preload), 'utf8');
    const names = new Set<string>();
    for (const match of body.matchAll(/exposeInMainWorld\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }
    return [...names];
  } catch {
    return [];
  }
}

const DESKTOP_INAPPLICABLE: readonly string[] = [
  'omd no-js — the shell is the JavaScript runtime; there is no scripting-disabled visitor',
  'omd award — the Awwwards rubric scores public marketing sites, not application chrome',
  'SEO, meta tags, sitemaps, social cards, and canonical URLs — nothing crawls a desktop window',
  'landing-page conversion, hero persuasion, and analytics funnels — the user already installed it',
  'a separate "web version" surface — the renderer is the only UI this project ships',
];

const readPackage = (cwd: string): { names: readonly string[]; scripts: Readonly<Record<string, string>> } => {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return { names: [], scripts: {} };
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    return {
      names: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }),
      scripts: pkg.scripts ?? {},
    };
  } catch {
    return { names: [], scripts: {} };
  }
};

const firstExisting = (cwd: string, candidates: readonly string[]): string | null =>
  candidates.find((candidate) => existsSync(join(cwd, candidate))) ?? null;

const scriptFor = (scripts: Readonly<Record<string, string>>, match: RegExp): string | null => {
  const found = Object.entries(scripts).find(([, body]) => match.test(body));
  return found === undefined ? null : `npm run ${found[0]}`;
};

/** Renderer dev port, read from the config rather than assumed, falling back to the tool default. */
function rendererPort(cwd: string, configFile: string | null, fallback: number): number {
  if (configFile === null) return fallback;
  try {
    const body = readFileSync(join(cwd, configFile), 'utf8');
    const match = /port\s*:\s*(\d{2,5})/.exec(body);
    const configuredPort = match?.[1];
    if (configuredPort !== undefined) {
      const port = Number(configuredPort);
      if (Number.isSafeInteger(port) && port > 0 && port < 65536) return port;
    }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'ENOENT' && code !== 'ENOTDIR' && code !== 'EISDIR'
      && code !== 'EACCES' && code !== 'EPERM') throw error;
  }
  return fallback;
}

export function detectAppShell(cwd: string): AppShell {
  const { names, scripts } = readPackage(cwd);
  const has = (name: string): boolean => names.includes(name);

  if (has('electron') || has('electron-vite') || has('electron-builder')) {
    const evidence: string[] = [];
    for (const name of ['electron', 'electron-vite', 'electron-builder']) if (has(name)) evidence.push(`package.json dependency ${name}`);
    const config = firstExisting(cwd, ['electron.vite.config.ts', 'electron.vite.config.js', 'electron.vite.config.mjs']);
    if (config !== null) evidence.push(config);
    const builtEntry = firstExisting(cwd, ['out/renderer/index.html', 'dist/renderer/index.html'])
      ?? (config !== null ? 'out/renderer/index.html' : null);
    return {
      kind: 'electron',
      evidence,
      devUrl: `http://localhost:${rendererPort(cwd, config, 5173)}`,
      builtEntry,
      builtEntryExists: builtEntry !== null && existsSync(join(cwd, builtEntry)),
      buildCommand: scriptFor(scripts, /electron-vite build|electron-builder|\bbuild\b/),
      devCommand: scriptFor(scripts, /electron-vite dev|electron \./),
      inapplicableChecks: DESKTOP_INAPPLICABLE,
    };
  }

  if (has('@tauri-apps/cli') || has('@tauri-apps/api') || existsSync(join(cwd, 'src-tauri'))) {
    const evidence: string[] = [];
    for (const name of ['@tauri-apps/cli', '@tauri-apps/api']) if (has(name)) evidence.push(`package.json dependency ${name}`);
    if (existsSync(join(cwd, 'src-tauri'))) evidence.push('src-tauri/');
    const builtEntry = firstExisting(cwd, ['dist/index.html', 'build/index.html']);
    return {
      kind: 'tauri',
      evidence,
      devUrl: `http://localhost:${rendererPort(cwd, firstExisting(cwd, ['vite.config.ts', 'vite.config.js']), 1420)}`,
      builtEntry,
      builtEntryExists: builtEntry !== null,
      buildCommand: scriptFor(scripts, /tauri build|vite build/),
      devCommand: scriptFor(scripts, /tauri dev|vite/),
      inapplicableChecks: DESKTOP_INAPPLICABLE,
    };
  }

  return {
    kind: 'browser',
    evidence: [],
    devUrl: null,
    builtEntry: null,
    builtEntryExists: false,
    buildCommand: null,
    devCommand: null,
    inapplicableChecks: [],
  };
}

/** One line a role can act on without reading this module. */
export function renderTargetHint(shell: AppShell): string {
  if (shell.kind === 'browser') return 'render the page or route directly';
  const served = shell.devUrl === null ? null : `${shell.devUrl} (start it with \`${shell.devCommand ?? 'the dev script'}\`)`;
  const built = shell.builtEntry === null
    ? null
    : `${shell.builtEntry}${shell.builtEntryExists ? '' : ` (build it with \`${shell.buildCommand ?? 'the build script'}\` first)`}`;
  return `renderer UI: ${[served, built].filter((part) => part !== null).join(' or ')}`;
}
