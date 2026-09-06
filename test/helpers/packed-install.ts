import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function installedPackageDirectories(root: string): readonly string[] {
  const nodeModules = join(root, 'node_modules');
  return readdirSync(nodeModules, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || entry.name.startsWith('.')) return [];
    const path = join(nodeModules, entry.name);
    if (!entry.name.startsWith('@')) return existsSync(join(path, 'package.json')) ? [path] : [];
    return readdirSync(path, { withFileTypes: true })
      .filter((child) => child.isDirectory() && existsSync(join(path, child.name, 'package.json')))
      .map((child) => join(path, child.name));
  });
}

/** Materializes lock-matched local package archives so packed-install tests never need registry cache. */
export function packOfflineWorkspaceDependencies(root: string, destination: string): readonly string[] {
  const before = new Set(readdirSync(destination));
  for (const packageDirectory of installedPackageDirectories(root)) {
    const result = spawnSync(NPM, ['pack', '--json', '--ignore-scripts', '--pack-destination', destination, packageDirectory], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`could not pack offline dependency ${packageDirectory}: ${result.stderr}`);
  }
  return readdirSync(destination)
    .filter((name) => name.endsWith('.tgz') && !before.has(name))
    .sort()
    .map((name) => join(destination, name));
}
