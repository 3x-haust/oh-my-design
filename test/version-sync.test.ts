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
