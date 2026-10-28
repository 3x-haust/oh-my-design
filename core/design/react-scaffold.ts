import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathsOutsideScope } from '../route/adaptive-route-record.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

type Route = Parameters<typeof pathsOutsideScope>[0];

/**
 * A new React project starts from the official Vite template rather than hand-written config, so index.html,
 * tsconfig and the build agree from the first render. create-vite only scaffolds into an empty folder (its
 * --overwrite empties a non-empty one, material folders included), so it runs in a temporary folder and the
 * files the route allows are copied in without replacing anything already there. Nothing is ever deleted.
 */
export const CREATE_VITE = 'create-vite@9.3.1';
export const REACT_TEMPLATE = 'react-ts';

export type ScaffoldRunner = (directory: string) => void;

const runCreateVite: ScaffoldRunner = directory => {
  const result = spawnSync('npx', ['-y', CREATE_VITE, 'app', '--template', REACT_TEMPLATE, '--no-interactive'],
    { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
  if (result.status !== 0) {
    throw new Error(`SCAFFOLD_FAILED: ${CREATE_VITE} exited ${result.status ?? result.signal}: ${(result.stderr || result.stdout).trim().slice(-600)}`);
  }
};

function files(directory: string, base = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(path, base);
    return entry.isFile() ? [relative(base, path).split('\\').join('/')] : [];
  });
}

export type ScaffoldResult = Readonly<{ template: string; written: string[]; kept: string[]; outsideScope: string[] }>;

export function scaffoldReactProject(root: string, route: Route & Pick<Route, 'projectMode'>, writer: ProjectWriteAdapter,
  run: ScaffoldRunner = runCreateVite): ScaffoldResult {
  if (route.projectMode !== 'greenfield') {
    throw new Error('SCAFFOLD_NOT_GREENFIELD: an existing project keeps its own stack; omd scaffold only starts a new one.');
  }
  if (existsSync(join(root, 'package.json'))) {
    throw new Error('SCAFFOLD_EXISTS: package.json already exists, so the project is already started; edit it instead of scaffolding again.');
  }
  const work = mkdtempSync(join(tmpdir(), 'omd-scaffold-'));
  try {
    run(work);
    const app = join(work, 'app');
    const written: string[] = [], kept: string[] = [], outsideScope: string[] = [];
    for (const path of files(app).sort()) {
      if (pathsOutsideScope(route as Route, [path]).length > 0) { outsideScope.push(path); continue; }
      if (existsSync(join(root, path))) { kept.push(path); continue; }
      const parent = path.split('/').slice(0, -1).join('/');
      if (parent) writer.mkdir(parent);
      writer.write(path, readFileSync(join(app, path)));
      written.push(path);
    }
    if (!written.includes('package.json')) throw new Error('SCAFFOLD_FAILED: the template produced no package.json inside the route scope.');
    return { template: `${CREATE_VITE} --template ${REACT_TEMPLATE}`, written, kept, outsideScope };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
