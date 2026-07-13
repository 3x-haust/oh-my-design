/**
 * Codex marketplace + plugin manifest structural tests.
 *
 * Schema source: https://learn.chatgpt.com/docs/build-plugins (via developers.openai.com/codex/plugins/build)
 * and https://codex.danielvaughan.com/2026/03/30/codex-cli-plugin-system/
 *
 * Required per-plugin entry fields: name, source.source, source.path, policy.installation,
 * policy.authentication, category.
 * Required plugin manifest fields (minimal): name, version, description.
 * skills path must be "./"-prefixed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitCodex } from '../adapters/codex.ts';
import { jsonFile } from './helpers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── repo-root static manifests ────────────────────────────────────────────────

interface CodexMarketplaceJson {
  name: string;
  version: string;
  plugins: Array<{
    name: string;
    version: string;
    source: { source: string; path: string };
    policy: { installation: string; authentication: string };
    category: string;
  }>;
}

interface CodexPluginJson {
  name: string;
  version: string;
  description: string;
  skills: string;
  mcpServers: string;
}

test('codex .agents/plugins/marketplace.json has required top-level fields', () => {
  const m = JSON.parse(
    readFileSync(join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'),
  ) as CodexMarketplaceJson;

  assert.ok(typeof m.name === 'string' && m.name.length > 0, 'marketplace.name must be a non-empty string');
  assert.ok(typeof m.version === 'string', 'marketplace.version must be present');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length > 0, 'marketplace.plugins must be a non-empty array');
});

test('codex marketplace plugins[0] has all required per-entry fields', () => {
  const m = JSON.parse(
    readFileSync(join(root, '.agents', 'plugins', 'marketplace.json'), 'utf8'),
  ) as CodexMarketplaceJson;

  const entry = m.plugins[0]!;
  assert.ok(typeof entry.name === 'string' && entry.name.length > 0, 'plugin entry must have a name');
  assert.ok(typeof entry.source?.source === 'string', 'plugin entry must have source.source');
  assert.ok(typeof entry.source?.path === 'string' && entry.source.path.startsWith('./'), 'source.path must be "./" prefixed');
  assert.ok(['AVAILABLE', 'INSTALLED_BY_DEFAULT', 'NOT_AVAILABLE'].includes(entry.policy.installation),
    `policy.installation must be a recognised value, got: ${entry.policy.installation}`);
  assert.ok(['ON_INSTALL', 'ON_FIRST_USE'].includes(entry.policy.authentication),
    `policy.authentication must be a recognised value, got: ${entry.policy.authentication}`);
  assert.ok(typeof entry.category === 'string' && entry.category.length > 0, 'plugin entry must have a category');
});

test('codex .codex-plugin/plugin.json at root has required fields (name, version, description)', () => {
  const p = JSON.parse(
    readFileSync(join(root, '.codex-plugin', 'plugin.json'), 'utf8'),
  ) as CodexPluginJson;

  assert.ok(typeof p.name === 'string' && p.name.length > 0, 'plugin.name must be a non-empty string');
  assert.ok(typeof p.version === 'string' && /^\d+\.\d+\.\d+/.test(p.version), 'plugin.version must be semver');
  assert.ok(typeof p.description === 'string' && p.description.length > 0, 'plugin.description must be non-empty');
});

test('codex .codex-plugin/plugin.json skills path is "./" prefixed', () => {
  const p = JSON.parse(
    readFileSync(join(root, '.codex-plugin', 'plugin.json'), 'utf8'),
  ) as CodexPluginJson;

  assert.ok(typeof p.skills === 'string' && p.skills.startsWith('./'), `skills must start with "./", got: ${p.skills}`);
});

test('codex .codex-plugin/plugin.json mcpServers points at ./.mcp.json', () => {
  const p = JSON.parse(
    readFileSync(join(root, '.codex-plugin', 'plugin.json'), 'utf8'),
  ) as CodexPluginJson;

  assert.equal(p.mcpServers, './.mcp.json');
});

// ── emitted dist manifest (adapters/codex.ts) ─────────────────────────────────

interface DistCodexPlugin {
  name: string;
  version: string;
  description: string;
  skills: string;
  mcpServers: string;
  interface?: { displayName?: string; shortDescription?: string };
}

test('emitCodex dist plugin.json includes version, description, and correct skills path', () => {
  const emitted = emitCodex({ version: '1.2.3' });
  const manifest = jsonFile<DistCodexPlugin>(emitted, '.codex-plugin/plugin.json');

  assert.equal(manifest.version, '1.2.3', 'version must be passed through');
  assert.ok(typeof manifest.description === 'string' && manifest.description.length > 0, 'description must be non-empty');
  assert.ok(manifest.skills.startsWith('./'), 'skills must be "./" prefixed');
  assert.equal(manifest.mcpServers, './.mcp.json');
});

test('emitCodex dist plugin.json defaults version to "0.0.0" when not supplied', () => {
  const emitted = emitCodex({});
  const manifest = jsonFile<DistCodexPlugin>(emitted, '.codex-plugin/plugin.json');
  assert.equal(manifest.version, '0.0.0');
});

test('emitCodex dist plugin.json has no agents key — agents are not part of the Codex plugin schema', () => {
  const emitted = emitCodex({ version: '0.13.0' });
  const manifest = jsonFile<Record<string, unknown>>(emitted, '.codex-plugin/plugin.json');
  assert.equal(manifest['agents'], undefined, 'agents key must not appear in codex plugin.json');
});
