import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const section = (source: string, heading: string): string => {
  const start = source.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const next = source.indexOf('\n## ', start + heading.length + 3);
  return source.slice(start, next === -1 ? undefined : next);
};
const compact = (source: string): string => source.replace(/\s+/g, ' ');

test('surface classification flows from the frame owner through the routed CLI check', () => {
  const framer = read('src/agents/framer.agent.yaml');
  assert.match(framer, /--surface/);
  assert.match(framer, /`marketing`[\s\S]*`product`[\s\S]*`editorial`[\s\S]*`mixed`/);

  const cli = read('bin/omd.ts');
  assert.match(cli, /--surface S/);
  assert.match(cli, /uxSurface: opts\.surface/);
  assert.match(read('core/frame/check-ux.ts'), /Product and mixed[\s*]+frames require exactly one valid/);
});

test('canonical product grammar rejects landing-page assumptions', () => {
  const ux = read('core/theory/ux.md');
  for (const phrase of [
    'dominant first-viewport anchor is the work object',
    'task loop, not a message ladder',
    'Density follows task frequency',
    'Reachable states are part of the surface',
  ]) assert.ok(ux.includes(phrase), `theory/ux.md must state: ${phrase}`);

  const composition = compact(read('core/protocol/composition-contract.md'));
  assert.match(composition, /task loop/);
  assert.match(composition, /work object/);
  assert.match(composition, /hero[\s\S]*?(grammar defect|rejection condition)/i);
});

test('adaptive routing delegates selected requirements to stage briefs instead of coordinator prose', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  assert.match(skill, /omd brief <stage>/);
  assert.match(skill, /read `omd brief <stage>` as coordinator intake/i);
  assert.match(skill, /§Evidence handoff/);
  assert.match(skill, /only the roles\/stages selected by the route/);
  assert.match(skill, /Candidate generation, framing, copy isolation, typography proof, composition[\s\S]*conditional methods/);

  const brief = read('core/brief/index.ts');
  assert.match(brief, /frame: \['functional-requirements', 'reality-ledger'\]/);
  assert.match(brief, /omd complete check <page>/);
  assert.match(brief, /owner: definition\?\.owner/);
});

test('product recipes remain conditional hypotheses', () => {
  for (const name of ['app-shell-workbench.md', 'master-detail-flow.md', 'form-wizard-stepper.md']) {
    const path = join(root, 'core', 'composition', name);
    assert.ok(existsSync(path), `missing recipe: ${name}`);
    const recipe = readFileSync(path, 'utf8');
    assert.match(recipe, /^## When it earns its place \/ When it does not$/m);
    assert.match(recipe, /Candidate hypothesis only/);
  }
  assert.match(read('core/composition/app-shell-workbench.md'), /Anti-hero clause/);
  assert.match(read('core/composition/master-detail-flow.md'), /Anti-overlay clause/);
  assert.match(read('core/composition/form-wizard-stepper.md'), /Anti-trap clause/);
});

test('reference synthesis has one protocol ABI and reaches production through a delivered composition stage', () => {
  const protocol = read('core/protocol/composition-contract.md');
  assert.match(protocol, /^## Reference synthesis$/m);
  assert.match(compact(protocol), /Required when user-origin references exist/);

  const validator = read('core/composition-contract/index.ts');
  assert.match(validator, /SYNTHESIS_SECTION = 'Reference synthesis'/);
  assert.match(validator, /COMPOSITION-SYNTHESIS/);

  const stages = read('core/stage/contract.ts');
  assert.match(stages, /id: 'composition', owner: 'omd-composer'[\s\S]*protocol\/composition-contract\.md/);
  assert.match(stages, /Contracts whose exact current bytes have a receipt/);

  const scout = compact(read('src/agents/scout.agent.yaml'));
  assert.match(scout, /omd ref principles/);
  assert.match(scout, /navigation model[\s\S]*density[\s\S]*state/i);
});

test('product-ux evals retain public regressions and task-based grading', () => {
  for (const path of [
    'evals/product-ux/prompts/01_support-console.md',
    'evals/product-ux/prompts/02_field-inspection-mobile.md',
    'evals/product-ux/prompts/03_studio-onboarding-billing.md',
    'evals/product-ux/heldout.md',
    'evals/product-ux/graders/blind-rubric.md',
  ]) assert.ok(existsSync(join(root, path)), `missing eval file: ${path}`);

  const rubric = read('evals/product-ux/graders/blind-rubric.md');
  assert.match(rubric, /UX quality — 60/);
  assert.match(rubric, /Reference synthesis — 25/);
  assert.match(rubric, /Visual craft — 15/);
  assert.match(read('evals/product-ux/heldout.md'), /public\s+regression fixtures/);
  for (const prompt of ['01_support-console.md', '02_field-inspection-mobile.md', '03_studio-onboarding-billing.md']) {
    assert.match(read(join('evals/product-ux/prompts', prompt)), /Core user tasks/);
  }
});

test('canonical protocol owns product task evidence and conditional regressions', () => {
  const loop = read('core/protocol/human-design-loop.md');
  const matrix = compact(section(loop, 'Task coverage matrix'));
  const coverage = compact(section(loop, 'UX task coverage'));
  const taskEvidence = compact(section(loop, 'Task evidence index'));

  assert.match(matrix, /frame owns/);
  assert.match(matrix, /only issuer of stable rows `T1`, `T2`/);
  assert.match(coverage, /composer preserves that id and maps it 1:1/);
  assert.match(coverage, /hand\s+consumes these existing mappings/);
  assert.match(taskEvidence, /exactly `schemaVersion`, `surface`, `frame`, `composition`, and `tasks`/);
  assert.match(taskEvidence, /exactly one distinct `recovery` probe/);

  const framer = compact(read('src/agents/framer.agent.yaml'));
  assert.match(framer, /Persist those rows only through `omd frame set --task-matrix`/);
  assert.match(framer, /list→detail workspace with two or more work objects/);
  assert.match(framer, /never a fixture identifier or list position/);

  const support = compact(section(loop, 'Support-chat conditional regression'));
  assert.match(support, /within the declared window merges without a duplicate sender\/time group/);
  assert.match(support, /expired-window same-sender reply splits into a new group with fresh metadata/);
  assert.match(support, /Do not apply these conversation traits to non-conversation, marketing, editorial, or static surfaces/);
});

test('Figma supplies structure evidence while fresh review and UX invariants remain mandatory', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  assert.match(skill, /A supplied Figma frame is structure evidence/);
  assert.match(skill, /the adaptive route decides whether\s+framing or alternatives are useful/);
  assert.match(skill, /without removing UX outcomes, production evidence, accessibility,\s+or independent review/);

  const hand = compact(read('src/agents/hand.agent.yaml'));
  assert.match(hand, /Figma structural-bypass route[\s\S]*\.omd\/figma\/snapshot\.json/);
  assert.match(hand, /fresh passing `omd figma diff/);

  const refinement = compact(read('core/protocol/human-design-loop.md'));
  assert.match(refinement, /applicable declared task probe/);
  assert.match(refinement, /accessibility check/);
  assert.match(refinement, /required-viewport task evidence/);
  assert.match(refinement, /round rolls back/);
  assert.match(refinement, /Blind-choose distinguishes visual quality only and cannot overrule those UX invariants/);
});

test('final evidence remains a v2-only immutable publication contract', () => {
  const protocol = compact(section(read('core/protocol/human-design-loop.md'), 'Production quality gates'));
  assert.match(protocol, /Final evidence is published only by the v2 pointer publisher/i);
  assert.match(protocol, /legacy v1 writer is disabled before it opens, validates, or writes a manifest/i);
  assert.match(protocol, /one immutable content-addressed record and then one pointer/);
  assert.match(protocol, /`omd evidence v2 finalize` is the sole publisher/i);
  assert.match(protocol, /v1 checker is historical-only[\s\S]*never writes, repairs, migrates, or republishes/i);
});
