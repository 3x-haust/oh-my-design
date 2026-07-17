import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const markdownSection = (source: string, heading: string): string => {
  const start = source.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const next = source.indexOf('\n## ', start + heading.length + 3);
  return source.slice(start, next === -1 ? undefined : next);
};

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
  const normalizedLoop = loop.replace(/\s+/g, ' ');
  assert.match(normalizedLoop, /Reference synthesis starts from function, not mood\. Field names, record shape, axis vocabulary, and validation belong exclusively to `protocol\/composition-contract\.md`/);
  assert.match(normalizedLoop, /Branch A — explicit functions/);
  assert.match(normalizedLoop, /Branch B — product goal only/);
  for (const source of [protocol, loop, composer, skill]) {
    assert.match(source.replace(/\s+/g, ' '), /Reference synthesis/);
  }
  assert.doesNotMatch(normalizedLoop, /sourceRef|observedRule|tokenVariation|conflictResolution|screenOrRoute/);
  assert.doesNotMatch(normalizedLoop, /color, radius, font, or vibe alone is not a transfer/);
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

// ── Product-UX evals: development + public regression fixtures + rubric weights ──

test('product-ux eval ships one development task, two public regression fixtures, and the 100-point rubric', () => {
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
  // Visible scenarios are public regression fixtures; true held-outs stay outside implementer context.
  const heldout = read('evals/product-ux/heldout.md');
  assert.match(heldout, /public\s+regression fixtures/);
  assert.match(heldout, /outside implementer context/);
  assert.doesNotMatch(heldout, /Scenarios 02 and 03 sealed as held-out/);
  assert.match(heldout, /Regression guard/);
  for (const prompt of ['02_field-inspection-mobile.md', '03_studio-onboarding-billing.md']) {
    const fixture = read(join('evals/product-ux/prompts', prompt));
    assert.match(fixture, /public regression fixture/);
    assert.doesNotMatch(fixture, /stays sealed/i);
  }
  // Every prompt names walkable core tasks — screenshots alone cannot grade them.
  for (const prompt of ['01_support-console.md', '02_field-inspection-mobile.md', '03_studio-onboarding-billing.md']) {
    assert.match(read(join('evals/product-ux/prompts', prompt)), /Core user tasks/);
  }
});

test('task-matrix ownership is frame -> composer -> hand without non-product contamination', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const taskMatrix = markdownSection(protocol, 'Task coverage matrix').replace(/\s+/g, ' ');
  const taskCoverage = markdownSection(protocol, 'UX task coverage').replace(/\s+/g, ' ');
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  const handTaskCoverage = hand.slice(
    hand.indexOf('For `product` or `mixed` surfaces, consume'),
    hand.indexOf('Use a purposeful visual carrier'),
  );
  const skillTaskCoverage = skill.slice(
    skill.indexOf('For `product` or `mixed` surfaces, the frame owns'),
    skill.indexOf('## 3. Typography proof before structure'),
  );

  assert.match(taskMatrix, /frame owns/);
  assert.match(taskMatrix, /only issuer of stable rows `T1`, `T2`/);
  assert.match(taskCoverage, /composer preserves that id and maps it 1:1/);
  assert.match(taskCoverage, /hand\s+consumes these existing mappings/);
  assert.match(taskCoverage, /never creates a new `T#` or a row merely because a state is reachable/);

  assert.match(framer, /Task coverage matrix/);
  assert.match(framer, /protocol\/human-design-loop\.md/);
  assert.match(framer, /task-row field names, applicability,\s+and cardinality/);
  assert.match(framer, /Persist those rows only through `omd frame set --task-matrix`[\s\S]*`marketing` or `editorial`, omit[\s\S]*`--task-matrix` entirely/);
  assert.equal((framer.match(/Bash\(omd pack:\*\)/g) ?? []).length, 1);

  for (const source of [handTaskCoverage, skillTaskCoverage]) {
    assert.match(source, /(?:frame owns the|frame-owned) `Task coverage matrix`/);
    assert.match(source, /composer maps every applicable frame `T#` (?:1:1 )?into `UX task coverage`|composer's 1:1 `UX task coverage` mappings/);
    assert.match(source, /protocol\/human-design-loop\.md[\s\S]*owns task-evidence fields, cardinality, cache locations, applicability, and validation/i);
    assert.match(source, /production-reachable task/);
    assert.match(source, /production locator/);
    assert.match(source, /omd evidence tasks --input[\s\S]*omd evidence tasks-check --json/);
    assert.match(source, /invalid submit[\s\S]*attemptable/i);
    assert.match(source, /same field's value|entered value preserved/i);
  }

});
test('list-detail task coverage remains generic, production-bound, and condition-gated', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const taskMatrix = markdownSection(protocol, 'Task coverage matrix').replace(/\s+/g, ' ');
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');

  for (const source of [taskMatrix, framer]) {
    assert.match(source, /list→detail workspace with two or more work objects/);
    assert.match(source, /production `T#`/);
    assert.match(source, /non-default, non-first (?:object|item)/);
    assert.match(source, /(?:detail's|selected detail) identity and object-local state/);
  }
  assert.match(taskMatrix, /bound production locator\/probe exercises that same non-primary selection/);
  assert.match(hand, /selection keyed by work-object item id, not a fixed fixture or list position/);
  assert.match(hand, /bound production locator\/probe must select the required non-primary item/);

  for (const source of [taskMatrix, framer, hand]) {
    assert.match(source, /(?:conditional|applicable|workspace shape)/i);
    assert.match(source, /(?:does not impose|do not add)[^.]{0,120}(?:other product|non-list-detail|marketing, editorial, or static)/i);
    assert.doesNotMatch(source, /#[0-9]{3,}/);
  }
});

test('task and final evidence schemas remain protocol-owned while roles execute validators', () => {
  const taskIndex = markdownSection(read('core/protocol/human-design-loop.md'), 'Task evidence index').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');

  assert.match(taskIndex, /exactly `schemaVersion`, `surface`, `frame`, `composition`, and `tasks`/);
  assert.match(taskIndex, /every viewport required by the frame row, a task has exactly one `primary` probe/i);
  assert.match(taskIndex, /exactly one distinct `recovery` probe/);
  assert.match(taskIndex, /decoded PNG at exactly `1280x900` for `desktop` or `390x844` for `mobile`/);

  for (const source of [hand, skill]) {
    assert.match(source, /protocol\/human-design-loop\.md[\s\S]*owns task-evidence fields, cardinality, cache locations, applicability, and validation/i);
    assert.match(source, /omd evidence tasks --input \.omd\/\.cache\/task-evidence-manifest\.json[\s\S]*omd evidence tasks-check --json/);
    assert.match(source, /never (?:create[\s\S]*|hand-write )`?\.omd\/task-evidence\.json`?/i);
    assert.doesNotMatch(source, /exactly `schemaVersion`, `surface`, `frame`, `composition`, and `tasks`/);
  }
});

test('final evidence schemas remain protocol-owned while roles finalize and check', () => {
  const protocol = markdownSection(read('core/protocol/human-design-loop.md'), 'Production quality gates').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');

  assert.match(protocol, /canonical final-evidence ABI and owns the manifest schema/);
  assert.match(protocol, /exactly `schemaVersion`, `runId`, `sourceSeal`, `build`, `tools`, `interaction`, and `artifacts`/);
  assert.match(protocol, /ordinary artifact[\s\S]*cache-local path under `?\.omd\/\.cache\/`/);
  assert.match(protocol, /source or build mutation invalidates the bundle and forces resealing, rebuilding, rerunning, and reindexing/);
  assert.match(protocol, /does not claim semantic copy\/source fidelity/);

  for (const source of [hand, skill]) {
    assert.match(source, /protocol\/human-design-loop\.md[\s\S]*final-evidence fields, artifact roles\/cardinality, cache locations, publication behavior, and stale-bundle handling/i);
    assert.match(source, /omd source --seal <root>[\s\S]*omd source --check <root>/);
    assert.match(source, /omd evidence finalize --input \.omd\/\.cache\/final-evidence-manifest\.json[\s\S]*omd evidence check --json/);
    assert.match(source, /never directly write(?:s)? `?\.omd\/final-evidence\.json`?/i);
    assert.match(source, /seal proves byte freshness only[\s\S]*does not prove semantic copy\/source fidelity/i);
    assert.doesNotMatch(source, /exactly `schemaVersion`, `runId`, `sourceSeal`, `build`, `tools`, `interaction`, and `artifacts`/);
  }
});
test('conditional list-detail and support-chat regressions are independent and generic', () => {
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');

  assert.match(loop, /## Support-chat conditional regression/);
  assert.match(loop, /within the declared window merges without a duplicate sender\/time group/);
  assert.match(loop, /expired-window same-sender reply splits into a new group with fresh metadata/);
  assert.match(loop, /desktop and mobile conversation viewport/);
  assert.match(loop, /immediate repeated-send regression and visible-last-bubble evidence/);
  assert.match(loop, /Do not apply these conversation traits to non-conversation, marketing, editorial, or static surfaces/);

  assert.match(skill, /\*\*List-detail branch:\*\*[\s\S]*only for a requested or task-completely inferred list→detail workspace/);
  assert.match(skill, /\*\*Support-chat branch:\*\*[\s\S]*only for an explicitly requested or task-completely inferred support-ticket conversation/);
  assert.doesNotMatch(skill, /list-detail workspaces or support-ticket conversations/);
  for (const source of [loop, framer, hand]) {
    assert.match(source, /never a fixture identifier or list position|not a fixed fixture or list position/);
    assert.doesNotMatch(source, /#[0-9]{3,}/);
  }
});

test('Figma uses one retained/skipped structural-bypass graph and refinement preserves UX invariants', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md').replace(/\s+/g, ' ');
  const loop = read('core/protocol/human-design-loop.md').replace(/\s+/g, ' ');
  const hand = read('src/agents/hand.agent.yaml').replace(/\s+/g, ' ');

  assert.match(skill, /Figma structural-bypass route[\s\S]*not a terminal handoff/);
  assert.match(skill, /retain preflight, framing\/task coverage, copy, typography proof, production build, craft\s+>?\s*checkpoints, safe probes, glance, sharp critique\/refinement, and ship/);
  assert.match(skill, /skip only concept hypothesis, scout\/reference synthesis, composition authoring, and\s+>?\s*independent sketch divergence\/blind selection/);
  assert.match(skill, /Do not run the normal structural graph as a second path/);
  assert.doesNotMatch(skill, /hand off to `omd-figma`[\s\S]*instead of running this loop/);
  assert.match(skill, /normal graph[\s\S]*require `omd composition --check` before its first production write/i);
  assert.match(skill, /Figma structural-bypass[\s\S]*\.omd\/figma\/snapshot\.json[\s\S]*\.omd\/figma\/design-system\.md[\s\S]*\.omd\/attribution\.md/i);
  assert.match(skill, /Figma structural-bypass route[\s\S]*omd figma diff <frame-id>[\s\S]*<rendered-page> --json/i);
  assert.match(skill, /normal graph also[\s\S]*fresh `omd composition --check`[\s\S]*Figma structural-bypass[\s\S]*fresh passing `omd figma diff`/i);
  assert.match(hand, /normal graph[\s\S]*omd composition\s+--check[\s\S]*before the first production write[\s\S]*before ship/i);
  assert.match(hand, /Figma structural-bypass route[\s\S]*\.omd\/figma\/snapshot\.json[\s\S]*omd figma diff[\s\S]*before ship/i);

  for (const source of [loop, skill]) {
    assert.match(source, /applicable declared task probe/);
    assert.match(source, /accessibility check/);
    assert.match(source, /required-viewport task evidence/);
    assert.match(source, /round rolls back|UX regression \(rollback\)/);
    assert.match(source, /[Bb]lind-choose[\s\S]*(?:visual (?:quality|distinction)|cannot overrule)/);
  }
});
