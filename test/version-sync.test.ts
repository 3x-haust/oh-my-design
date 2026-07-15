import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('plugin.json, marketplace.json (top-level and plugins[0]), and package.json versions all match', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')) as { version: string };
  const marketplace = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8')) as {
    version: string;
    plugins: Array<{ version: string }>;
  };

  assert.equal(plugin.version, pkg.version, 'plugin.json version must match package.json');
  assert.equal(marketplace.version, pkg.version, 'marketplace.json top-level version must match package.json');
  assert.equal(marketplace.plugins[0]!.version, pkg.version, 'marketplace.json plugins[0].version must match package.json');
});

test('codex .codex-plugin/plugin.json and .agents/plugins/marketplace.json versions match package.json', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  const codexPlugin = JSON.parse(readFileSync(join(root, '.codex-plugin', 'plugin.json'), 'utf8')) as { version: string };
  const codexMarketplace = JSON.parse(readFileSync(join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8')) as {
    version: string;
    plugins: Array<{ version: string }>;
  };

  assert.equal(codexPlugin.version, pkg.version, '.codex-plugin/plugin.json version must match package.json');
  assert.equal(codexMarketplace.version, pkg.version, '.agents/plugins/marketplace.json top-level version must match package.json');
  assert.equal(codexMarketplace.plugins[0]!.version, pkg.version, '.agents/plugins/marketplace.json plugins[0].version must match package.json');
});

test('npm package includes both README files linked from the primary README', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { files: string[] };
  const readme = readFileSync(join(root, 'README.md'), 'utf8');

  assert.match(readme, /\[한국어\]\(README\.ko\.md\)/, 'README.md must keep the Korean README link');
  assert.ok(pkg.files.includes('README.md'), 'package files must include README.md');
  assert.ok(pkg.files.includes('README.ko.md'), 'package files must include README.ko.md');
});
