import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  createBuildIdentity,
  createBuildIdentityFromSource,
  skillDisplayName,
  skillOpenaiMetadata,
} from '../adapters/build.ts';
import { expectedPrebuiltFiles } from '../core/install/prebuilt-payload.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skills = ['coach', 'critique', 'figma', 'humanize', 'scout', 'ultradesign'] as const;

interface Metadata { interface: { display_name: string; short_description: string } }
const parseMetadata = (source: string): Metadata => parse(source) as Metadata;
const readMetadata = (path: string): Metadata => parseMetadata(readFileSync(path, 'utf8'));

test('build identity is deterministic and generated host manifests bind package and source skill bytes', async () => {
  const agents = [{
    name: 'omd-eye',
    description: 'Read-only reviewer.',
    reasoning: 'high',
    deny: ['Write'],
    instructions: 'Review only.',
  }];
  const skills = [{ name: 'omd-review', description: 'Review.', source: 'name: omd-review\nbody\n' }];
  const first = createBuildIdentity('0.18.0', agents, skills);
  const second = createBuildIdentity('0.18.0', [...agents].reverse(), [...skills].reverse());

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, createBuildIdentity('0.18.0', agents, [{
    ...skills[0]!,
    source: `${skills[0]!.source}changed\n`,
  }]));
  assert.match(first.buildSha256, /^[a-f0-9]{64}$/);
  assert.match(first.sourceSkillSha256, /^[a-f0-9]{64}$/);

  const { emitClaude } = await import('../adapters/claude.ts');
  const { emitCodex } = await import('../adapters/codex.ts');
  for (const manifest of [
    emitClaude({ agents, buildIdentity: first }).files['.claude-plugin/plugin.json'],
    emitCodex({ agents, version: '0.18.0', buildIdentity: first }).files['.codex-plugin/plugin.json'],
  ]) {
    assert.deepEqual((manifest as { buildIdentity: unknown }).buildIdentity, first);
  }
});
test('prebuilt validation emits host manifests with the source build identity', () => {
  const buildIdentity = createBuildIdentityFromSource(root);

  for (const host of ['claude', 'codex'] as const) {
    const manifestPath = host === 'claude' ? '.claude-plugin/plugin.json' : '.codex-plugin/plugin.json';
    const expected = expectedPrebuiltFiles(root, host).get(manifestPath);
    assert.ok(expected !== undefined && expected.kind === 'json');
    assert.deepEqual(expected.value, JSON.parse(readFileSync(join(root, 'dist', host, manifestPath), 'utf8')));
    assert.deepEqual((expected.value as { buildIdentity: unknown }).buildIdentity, buildIdentity);
  }
});
test('all OMD skills share the compact display label in direct and root plugin metadata', () => {
  for (const skill of skills) {
    const canonical = `omd-${skill}`;
    const expected = `(omd) ${skill}`;

    assert.equal(skillDisplayName(canonical), expected);
    assert.equal(
      parseMetadata(skillOpenaiMetadata(canonical, 'First sentence. Second sentence.')).interface.display_name,
      expected,
    );
    const rootMetadata = readMetadata(join(root, 'skills', skill, 'agents', 'openai.yaml'));
    assert.equal(rootMetadata.interface.display_name, expected);
    assert.ok(rootMetadata.interface.short_description.length > 0, `${skill} short_description must stay non-empty`);

    assert.match(readFileSync(join(root, 'src', 'skills', canonical, 'SKILL.md'), 'utf8'), new RegExp(`^name: ${canonical}$`, 'm'));
    assert.match(readFileSync(join(root, 'skills', skill, 'SKILL.md'), 'utf8'), new RegExp(`^name: ${skill}$`, 'm'));
  }
});

test('display metadata preserves descriptions and the non-OMD fallback policy', () => {
  assert.equal(skillDisplayName('plain-skill'), 'Plain-skill');
  const metadata = parseMetadata(skillOpenaiMetadata('plain-skill', 'First sentence. Second sentence.'));
  assert.equal(metadata.interface.display_name, 'Plain-skill');
  assert.equal(metadata.interface.short_description, 'First sentence.');
});
