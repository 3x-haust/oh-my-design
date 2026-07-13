import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { skillDisplayName, skillOpenaiMetadata } from '../adapters/build.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const metadata = (path: string): { interface: { display_name: string; short_description: string } } =>
  parse(readFileSync(path, 'utf8')) as { interface: { display_name: string; short_description: string } };

test('ultradesign gets the compact Codex UI label without changing canonical identity', () => {
  assert.equal(skillDisplayName('omd-ultradesign'), '(omd) ultradesign');

  const direct = parse(skillOpenaiMetadata('omd-ultradesign', 'First sentence. Second sentence.')) as {
    interface: { display_name: string; short_description: string };
  };
  const plugin = metadata(join(root, 'skills/ultradesign/agents/openai.yaml'));
  assert.equal(direct.interface.display_name, '(omd) ultradesign');
  assert.equal(plugin.interface.display_name, '(omd) ultradesign');
  assert.equal(direct.interface.short_description, 'First sentence.');

  assert.match(readFileSync(join(root, 'src/skills/omd-ultradesign/SKILL.md'), 'utf8'), /^name: omd-ultradesign$/m);
  assert.match(readFileSync(join(root, 'skills/ultradesign/SKILL.md'), 'utf8'), /^name: ultradesign$/m);
  assert.match(readFileSync(join(root, 'skills/ultradesign/SKILL.md'), 'utf8'), /oh-my-design:figma/);
});

test('other skills retain the existing titleCase display policy', () => {
  assert.equal(skillDisplayName('omd-humanize'), 'Omd-humanize');
  const direct = parse(skillOpenaiMetadata('omd-humanize', 'Rewrite copy. Keep facts.')) as {
    interface: { display_name: string; short_description: string };
  };
  assert.equal(direct.interface.display_name, 'Omd-humanize');
  assert.equal(direct.interface.short_description, 'Rewrite copy.');
});
