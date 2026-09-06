import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path: string): string => readFileSync(
  fileURLToPath(new URL(`../${path}`, import.meta.url)),
  'utf8',
).replace(/\s+/g, ' ');

test('a selected first-party concept keeps visual authority across the production handoff', () => {
  const imagegen = read('core/theory/imagegen.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  for (const source of [imagegen, loop]) {
    assert.match(source, /project-owned concept (?:image[\s\S]{0,80})?target/i);
    assert.match(source, /before (?:typography|type) or structure freezes/i);
    assert.match(source, /load-bearing (?:visible )?invariants/i);
  }
  assert.match(skill, /For concept formation, first-party targets[\s\S]*theory\/imagegen\.md[\s\S]*protocol\/human-design-loop\.md/i);
  assert.match(imagegen, /concept-making and production owners may receive the exact target/i);
  assert.match(loop, /competitive and gallery sources remain scout-only and source-isolated/i);
  assert.match(skill, /External references stay sanitized/i);
  for (const source of [imagegen, loop]) {
    assert.match(source, /blind (?:selectors and reviewers|selectors\/reviewers|reviewers)[\s\S]{0,100}(?:invariant|bound invariants)/i);
  }
  assert.match(loop, /command or frequent action remains usable[\s\S]*does not automatically replace[\s\S]*visual identity/i);
});

test('ambition examples widen invention without becoming a style recipe', () => {
  const imagegen = read('core/theory/imagegen.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  for (const source of [imagegen, loop]) {
    assert.match(source, /ambition[\s\S]{0,180}(?:not|rather than)[\s\S]{0,80}(?:recipe|style)/i);
    assert.match(source, /(?:spatial|Spatial)[\s\S]{0,140}(?:media|interaction)[\s\S]{0,160}metaphorical/i);
    assert.match(source, /not a (?:mandatory )?taxonomy|not axes to fill/i);
    assert.match(source, /entire (?:user-)?supplied concept study[\s\S]{0,100}`literalPropsToReject`/i);
  }
  for (const source of [imagegen, loop]) {
    assert.match(source, /concrete visible deficiency|observable criteria grounded in the actual brief/i);
    assert.match(source, /familiarity|“familiar”/i);
  }
  assert.match(skill, /ambition examples[\s\S]*only rendered hypotheses can win/i);
});

test('concept inquiry begins from subject behavior instead of a preset composition menu', () => {
  const imagegen = read('core/theory/imagegen.md');
  assert.match(imagegen, /Begin with the subject rather than a menu of page patterns/i);
  assert.match(imagegen, /operation, material, relationship, or action[\s\S]*visual or interaction rule[\s\S]*experience consequence/i);
  assert.match(imagegen, /prompts for inquiry, not required categories/i);
  for (const preset of ['**Theme**:', '**Hero architecture**:', '**Section system**:', '**Background mode**:']) {
    assert.doesNotMatch(imagegen, new RegExp(preset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('conceptual hypotheses remain unresolved until visible evidence exists', () => {
  const imagegen = read('core/theory/imagegen.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  for (const source of [imagegen, loop]) {
    assert.match(source, /(?:hypotheses|ideas)[\s\S]{0,120}(?:visible experiments|made visible)/i);
    assert.match(source, /(?:prose|Prose)[\s\S]{0,80}metadata[\s\S]{0,100}(?:winner|choose)/i);
  }
  assert.match(skill, /only rendered hypotheses can win/i);
  assert.doesNotMatch(loop, /creates and selects two-to-three independent image-first drafts/i);
});

test('preselection studies use alternative-owned metaphor fields without becoming authority', () => {
  const imagegen = read('core/theory/imagegen.md');
  assert.match(imagegen, /Before selection[\s\S]*each non-authoritative visual study[\s\S]*its own art-direction alternative's[\s\S]*metaphorQualities[\s\S]*literalPropsToReject/i);
  assert.match(imagegen, /does not publish composition[\s\S]*Sketch-candidate selection[\s\S]*production approval/i);
  assert.match(imagegen, /After selection[\s\S]*selected decision's exact fields/i);
  assert.match(imagegen, /does not relax the art-direction schema[\s\S]*final selection validation[\s\S]*privacy[\s\S]*exclusions/i);
  assert.doesNotMatch(imagegen, /Every generation direction consumes the selected decision/i);
});

test('fit studies repair the implementation before sacrificing concept-bearing scale', () => {
  const imagegen = read('core/theory/imagegen.md');
  const loop = read('core/protocol/human-design-loop.md');

  for (const source of [imagegen, loop]) {
    assert.match(source, /clipping|clips/i);
    assert.match(source, /wrapping[\s\S]*container geometry[\s\S]*responsive recomposition/i);
    assert.match(source, /before shrinking concept-bearing type/i);
  }
});

test('visual selection can reject all adequate candidates and metadata cannot accept the render', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(loop, /merely adequate[\s\S]*requires exceptional[\s\S]*returns no winner/i);
  assert.match(loop, /metadata reconciliation may not freeze the lost render as the chosen design/i);
  assert.match(loop, /Hashes, schema validity, currentness checks[\s\S]*prove transport[\s\S]*not visual/i);
});

test('bound concept invariants cannot be weakened during implementation', () => {
  const imagegen = read('core/theory/imagegen.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  for (const source of [imagegen, loop]) {
    assert.match(source, /Hand cannot (?:relax|waive)/i);
    assert.match(source, /owning (?:design )?stage[\s\S]{0,100}(?:visible evidence|current-user direction)/i);
  }
  assert.match(skill, /Hand cannot relax bound invariants/i);
});

test('colour policy remains evidence-led instead of imposing one universal ground', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  assert.match(skill, /No dominant ground or neutral palette is a universal default/i);
  assert.doesNotMatch(skill, /Product uses true white/i);
});
