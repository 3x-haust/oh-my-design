#!/usr/bin/env node
/**
 * scripts/bump.ts — bump the version in all three manifests atomically.
 *
 * Usage:
 *   node scripts/bump.ts [--dry-run] <new-version>
 *
 * Examples:
 *   node scripts/bump.ts 0.6.0
 *   node scripts/bump.ts --dry-run 0.6.0
 *
 * In dry-run mode, prints what would change to stdout without writing files
 * or running build/tests.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildReleaseNotes } from './release-notes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Rewrite every `"version": "..."` field in a JSON string to `newVersion`.
 * Covers both single-version files (package.json, plugin.json) and files
 * with multiple version fields (marketplace.json top-level + plugins[0]).
 * Preserves all other formatting.
 */
export function bumpJson(content: string, newVersion: string): string {
  return content.replace(/"version"\s*:\s*"[^"]*"/g, `"version": "${newVersion}"`);
}

const MANIFESTS = [
  'package.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
] as const;

function run(args: string[]): void {
  const dryRun = args.includes('--dry-run');
  const version = args.filter((a) => !a.startsWith('--')).at(-1);

  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    process.stderr.write('Usage: node scripts/bump.ts [--dry-run] <new-version>\n');
    process.stderr.write('Example: node scripts/bump.ts --dry-run 0.6.0\n');
    process.exit(1);
  }

  const changes: Array<{ path: string; before: string; after: string }> = [];

  for (const rel of MANIFESTS) {
    const abs = join(root, rel);
    const before = readFileSync(abs, 'utf8');
    const after = bumpJson(before, version);
    changes.push({ path: rel, before, after });
  }

  // Report what will change
  for (const { path, before, after } of changes) {
    if (before === after) {
      process.stdout.write(`  ${path}: already at ${version} (no change)\n`);
    } else {
      const prevMatch = /"version"\s*:\s*"([^"]*)"/.exec(before);
      const prev = prevMatch?.[1] ?? '?';
      process.stdout.write(`  ${path}: ${prev} → ${version}\n`);
    }
  }

  if (dryRun) {
    process.stdout.write('\n[dry-run] no files written\n');
    return;
  }

  // Write
  for (const { path, after } of changes) {
    writeFileSync(join(root, path), after);
  }
  process.stdout.write(`\nwrote ${MANIFESTS.length} manifests\n`);

  // Keep package-lock.json's version field in sync with package.json.
  // MANIFESTS deliberately excludes the lockfile (bumpJson's global regex
  // would rewrite every dependency version), so resync it via npm here.
  process.stdout.write('\nsyncing package-lock.json...\n');
  const lockSync = spawnSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], {
    cwd: root,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: true,
  });
  if (lockSync.status !== 0) {
    process.stderr.write('package-lock sync failed — manifests were written.\n');
    process.exit(lockSync.status ?? 1);
  }

  // Build
  process.stdout.write('\nrunning build...\n');
  const build = spawnSync(process.execPath, ['adapters/build.ts'], {
    cwd: root,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    process.stderr.write('build failed — manifests were written, build was not.\n');
    process.exit(build.status ?? 1);
  }

  // Test
  process.stdout.write('\nrunning tests...\n');
  const test = spawnSync(process.execPath, ['--test', 'test/*.test.ts'], {
    cwd: root,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: true,
  });
  if (test.status !== 0) {
    process.stderr.write('tests failed — version was bumped but tests did not pass.\n');
    process.exit(test.status ?? 1);
  }

  process.stdout.write(`\nready: v${version} — commit .claude-plugin/plugin.json, .claude-plugin/marketplace.json, package.json\n`);

  // Print a release notes preview so the committer can see what CI will
  // generate.  PR list and test count are filled in by the release workflow;
  // this preview uses the locally-available data only.
  const prevTagResult = spawnSync('git', ['describe', '--tags', '--abbrev=0'], {
    cwd: root,
    encoding: 'utf8',
  });
  const prevTag = prevTagResult.stdout?.trim() || 'v0.0.0';
  const preview = buildReleaseNotes({
    version,
    prevTag,
    summary: `Release v${version}`,
    prs: [],   // CI populates this from gh pr list
    testCount: 0, // CI runs the suite and injects the real count
  });
  process.stdout.write('\n── release notes preview (CI fills PR list + test count) ──\n');
  process.stdout.write(preview + '\n');
  process.stdout.write('────────────────────────────────────────────────────────────\n');
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2));
}
