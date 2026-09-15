import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const role = (name: string): string => {
  const agent = parse(read(`src/agents/${name}.agent.yaml`)) as { instructions: string };
  return agent.instructions.replace(/\s+/g, ' ');
};

test('adaptive consumers permit only an authoritative explicit typed art-direction skip', () => {
  for (const name of ['composer', 'writer', 'hand', 'eye']) {
    const prompt = role(name);
    assert.ok(prompt.includes('[adaptive-art-direction:consumer]'), name);
    assert.match(prompt, /authoritative adaptive/);
    assert.match(prompt, /explicit.*art-direction skip|explicit art-direction skip/);
    assert.match(prompt, /typed skip receipt/);
    assert.match(prompt, /Missing is not skipped/);
    assert.match(prompt, /selected frame\/copy\/type\/scout\/reference projection/);
    assert.match(prompt, /do not fabricate.*register, motion decision, metaphor contract/);
    assert.match(prompt, /art-direction\/motion\/settled-selection hashes/);
    assert.match(prompt, /all other selected prerequisites, current evaluator lineage, source-free boundaries, and design-quality acceptance criteria/);
    assert.match(prompt, /When art direction is selected \(and on non-adaptive routes that require it\)/);
  }
});

test('selected art direction retains immutable visual and copy-safe contracts', () => {
  const composer = role('composer');
  assert.match(composer, /immutable selected `art-direction-v2` decision.*`art-direction-record-v3`/);
  assert.match(composer, /activation binding, and settled selection/);
  assert.match(composer, /\[metaphor-contract:visual-consumer\].*`metaphorQualities` and `literalPropsToReject`/);
  const writer = role('writer');
  assert.match(writer, /authorized evaluator evidence, checked the selected art direction, and settled motion/);
  assert.match(writer, /immutable Beat IDs, and exact Beat-exception receipt/);
  assert.match(writer, /copy-safe projection, never the private `metaphorQualities` or `literalPropsToReject` values/);
  for (const name of ['hand', 'eye']) {
    assert.match(role(name), /immutable decision, evaluator evidence, settled motion, activation binding, settled selection, and all required downstream lineage/);
  }
  assert.match(role('eye'), /source-free review packet/);
  assert.match(role('eye'), /never waives task fit, hierarchy, responsive craft, or beauty/);
});

test('reference assembly does not unconditionally require image-first or phantom direction lineage', () => {
  const composer = role('composer');
  assert.doesNotMatch(composer, /When reference assembly applies, begin after.*image-first/);
  assert.match(composer, /When the route selects image-first exploration, begin after/);
  assert.match(composer, /When image-first exploration is selected, image-first composition/);
  assert.match(composer, /`motionDecision` only when art direction is selected, never inferring one/);
  assert.match(composer, /Independently selected image-first exploration still requires its coordinator-chosen draft or authorized CSS\/SVG fallback/);
  assert.doesNotMatch(role('hand'), /manifest.*binding the immutable art-direction record/);
  assert.match(role('hand'), /When art direction is selected, bind the immutable art-direction record, current selection, settled motion projection/);
  for (const path of ['core/protocol/human-design-loop.md', 'core/protocol/reference-assembly.md']) {
    const protocol = read(path).replace(/\s+/g, ' ');
    assert.match(protocol, /Only an explicit art-direction skip.*typed skip receipt/);
    assert.match(protocol, /Missing is not skipped/);
    assert.match(protocol, /Reference assembly alone does not select image-first exploration/);
    assert.doesNotMatch(protocol, /When reference assembly applies, it starts after.*image-first draft/);
  }
});
