import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { skillDisplayName, skillOpenaiMetadata } from '../adapters/build.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skills = ['coach', 'critique', 'figma', 'humanize', 'scout', 'ultradesign'] as const;

interface Metadata { interface: { display_name: string; short_description: string } }
const parseMetadata = (source: string): Metadata => parse(source) as Metadata;
const readMetadata = (path: string): Metadata => parseMetadata(readFileSync(path, 'utf8'));

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
