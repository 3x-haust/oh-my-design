import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

// ── Surface classification is a frame-level anchor ────────────────────────────

test('frame surface classification flows framer -> CLI -> check', () => {
  const framer = read('src/agents/framer.agent.yaml');
  assert.match(framer, /--surface/);
  assert.match(framer, /`marketing`[\s\S]*`product`[\s\S]*`editorial`[\s\S]*`mixed`/);
  assert.match(framer, /Surface types/);

  const cli = read('bin/omd.ts');
  assert.match(cli, /--surface S/);
  assert.match(cli, /uxSurface: opts\.surface/);

  const check = read('core/frame/check-ux.ts');
  assert.match(check, /uxSurface \(--surface\)/);
});

test('theory/ux.md carries the surface-type taxonomy and product grammar', () => {
  const ux = read('core/theory/ux.md');
  assert.match(ux, /^## Surface types: a work surface is not a landing page$/m);
  for (const phrase of [
    'dominant first-viewport anchor is the work object',
    'task loop, not a message ladder',
    'Density follows task frequency',
    'Reachable states are part of the surface',
  ]) {
    assert.ok(ux.includes(phrase), `theory/ux.md must state: ${phrase}`);
  }
});

// ── Composition grammar routes on the surface classification ─────────────────

test('composition protocol and composer compose product surfaces as a task loop', () => {
  const protocol = read('core/protocol/composition-contract.md');
  const composer = read('src/agents/composer.agent.yaml');
  for (const source of [protocol, composer]) {
    const contract = source.replace(/\s+/g, ' ');
    assert.match(contract, /task loop/);
    assert.match(contract, /orient/i);
    assert.match(contract, /work object/);
  }
  // A hero claiming a work surface's first viewport is a named defect, not taste.
  assert.match(protocol.replace(/\s+/g, ' '), /hero[\s\S]*?(grammar defect|rejection condition)/i);
});

test('the loop protocol, skill, sketch, eye, and hand share the surface grammar', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const sketch = read('src/agents/sketch.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');

  assert.match(loop, /^## Surface grammar$/m);
  for (const source of [loop, skill, eye, hand]) {
    assert.match(source.replace(/\s+/g, ' '), /work object/);
  }
  // The selector reads its frozen dimensions through the grammar without replacing them.
  assert.match(eye.replace(/\s+/g, ' '), /screen region or reachable state/);
  assert.match(eye.replace(/\s+/g, ' '), /task-loop dependency/);
  // Sketches represent the work surface, never a rejected hero band.
  assert.match(sketch.replace(/\s+/g, ' '), /never a hero band the contract rejected/);
  // Product/mixed surfaces always complete the design contract (states discipline).
  assert.match(skill.replace(/\s+/g, ' '), /`product` or `mixed` surface[\s\S]*?run `omd design`/);
});

// ── Product-surface composition recipes exist with the cookbook structure ────

test('product-surface recipes exist and stay condition-gated', () => {
  for (const name of ['app-shell-workbench.md', 'master-detail-flow.md', 'form-wizard-stepper.md']) {
    const path = join(root, 'core', 'composition', name);
    assert.ok(existsSync(path), `missing recipe: ${name}`);
    const content = readFileSync(path, 'utf8');
    assert.match(content, /^## When it earns its place \/ When it does not$/m);
    assert.match(content, /Candidate hypothesis only/);
  }
  const shell = read('core/composition/app-shell-workbench.md');
  assert.match(shell, /Anti-hero clause/);
  const md = read('core/composition/master-detail-flow.md');
  assert.match(md, /Anti-overlay clause/);
  const wizard = read('core/composition/form-wizard-stepper.md');
  assert.match(wizard, /Anti-trap clause/);
});

// ── Reference synthesis is a validated contract, not a mood ──────────────────

test('reference synthesis contract is shared by protocol, scout, composer, skill, and validator', () => {
  const protocol = read('core/protocol/composition-contract.md');
  const loop = read('core/protocol/human-design-loop.md');
  const scout = read('src/agents/scout.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(protocol, /^## Reference synthesis$/m);
  for (const source of [protocol, loop, composer, skill]) {
    assert.match(source.replace(/\s+/g, ' '), /Reference synthesis/);
  }
  // The scout studies user references as structural units, recorded as principles.
  assert.match(scout.replace(/\s+/g, ' '), /omd ref principles/);
  assert.match(scout.replace(/\s+/g, ' '), /navigation model[\s\S]*density[\s\S]*state/i);
  // The validator exports the section name and the finding id exists.
  const validator = read('core/composition-contract/index.ts');
  assert.match(validator, /SYNTHESIS_SECTION = 'Reference synthesis'/);
  assert.match(validator, /COMPOSITION-SYNTHESIS/);
  // The hand treats synthesis entries as production acceptance criteria.
  const hand = read('src/agents/hand.agent.yaml');
  assert.match(hand.replace(/\s+/g, ' '), /Reference synthesis[\s\S]*acceptance criteria/);
  // The sharp eye verifies planned traits without receiving capture rationale.
  const eye = read('src/agents/eye.agent.yaml');
  assert.match(eye.replace(/\s+/g, ' '), /synthesis failure/);
});

// ── Product-UX evals: fixed + held-out + rubric weights ───────────────────────

test('product-ux eval ships one development task, two held-out tasks, and the 100-point rubric', () => {
  for (const path of [
    'evals/product-ux/prompts/01_support-console.md',
    'evals/product-ux/prompts/02_field-inspection-mobile.md',
    'evals/product-ux/prompts/03_studio-onboarding-billing.md',
    'evals/product-ux/heldout.md',
    'evals/product-ux/graders/blind-rubric.md',
    'evals/reference-synthesis/prompt.md',
    'evals/reference-synthesis/graders/synthesis-map.md',
  ]) {
    assert.ok(existsSync(join(root, path)), `missing eval file: ${path}`);
  }
  const rubric = read('evals/product-ux/graders/blind-rubric.md');
  assert.match(rubric, /UX quality — 60/);
  assert.match(rubric, /Reference synthesis — 25/);
  assert.match(rubric, /Visual craft — 15/);
  assert.match(rubric, /Core task completion \(15\)/);
  // Held-out scenarios stay sealed and a marketing eval guards against regression.
  const heldout = read('evals/product-ux/heldout.md');
  assert.match(heldout, /sealed/);
  assert.match(heldout, /Regression guard/);
  // Every prompt names walkable core tasks — screenshots alone cannot grade them.
  for (const prompt of ['01_support-console.md', '02_field-inspection-mobile.md', '03_studio-onboarding-billing.md']) {
    assert.match(read(join('evals/product-ux/prompts', prompt)), /Core user tasks/);
  }
});
