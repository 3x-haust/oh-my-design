import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { ADAPTIVE_BEHAVIOR_POLICY } from '../core/route/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const instructions = (role: 'framer' | 'composer' | 'sketch' | 'hand' | 'eye'): string => {
  const agent = parse(read(`src/agents/${role}.agent.yaml`)) as { instructions?: unknown };
  if (typeof agent.instructions !== 'string') throw new Error(`${role} instructions are missing`);
  return agent.instructions;
};

test('prompt-only greenfield roles carry one reality-first contract', () => {
  assert.match(read('core/protocol/human-design-loop.md'), /^## Greenfield authenticity$/m);

  const expected = {
    framer: '[greenfield-authenticity:reality-owner]',
    composer: '[greenfield-authenticity:composition-consumer]',
    sketch: '[greenfield-authenticity:sketch-consumer]',
    hand: '[greenfield-authenticity:production-consumer]',
    eye: '[greenfield-authenticity:review-gate]',
  } as const;
  for (const role of Object.keys(expected) as (keyof typeof expected)[]) {
    assert.ok(instructions(role).includes(expected[role]), role);
  }

  assert.match(instructions('framer').replace(/\s+/g, ' '), /never invent a brand name, operational record, customer, metric, or capability/i);
  assert.match(instructions('composer').replace(/\s+/g, ' '), /product distinction comes from the task model, content, hierarchy, and interaction/i);
  assert.match(instructions('hand').replace(/\s+/g, ' '), /do not add English micro-labels, case numbers, status metadata, or documentary annotations/i);
  assert.match(instructions('eye').replace(/\s+/g, ' '), /reality-fit/);
  assert.match(instructions('eye'), /realityFit: GREEN/);
  assert.match(
    instructions('framer').replace(/\s+/g, ' '),
    /marketing brief requires a product difference[\s\S]*capability as unknown[\s\S]*block art direction and production/i,
  );
  assert.match(
    instructions('composer').replace(/\s+/g, ' '),
    /do not infer a product capability or mechanism from category references/i,
  );
});

test('framer persists greenfield reality through its allowed CLI boundary', () => {
  const framer = read('src/agents/framer.agent.yaml').replace(/\s+/g, ' ');
  assert.match(framer, /append `--reality '<JSON object>'`/i);
  assert.doesNotMatch(framer, /write the bounded `reality-ledger-v1` JSON to/i);
});

test('blind eye may receive the bounded reality ledger it must judge', () => {
  const eye = read('src/agents/eye.agent.yaml').replace(/\s+/g, ' ');
  assert.match(eye, /role-bounded review brief:[^.]*bounded reality ledger/i);
});

test('surface grammar and expression register remain independent downstream', () => {
  const sources = [
    read('core/protocol/human-design-loop.md'),
    read('core/theory/expressive.md'),
    read('src/agents/eye.agent.yaml'),
    read('src/agents/composer.agent.yaml'),
  ].map((value) => value.replace(/\s+/g, ' '));
  assert.match(sources[0]!, /Expression register never changes surface grammar/i);
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /(?:`marketing`\/showpiece|`marketing` or showpiece|`product`\/quiet|`product` or quiet|quiet\/product) surface/i,
    );
  }
});

test('product visual policy is semantic rather than marketing decoration policy', () => {
  const visual = ADAPTIVE_BEHAVIOR_POLICY.visual;
  assert.match(read('core/theory/color.md'), /It is not a universal product-UI ratio/);
  assert.equal(visual.colourDistribution, 'surface-conditional');
  assert.equal(visual.marketingColourDistribution, '60-30-10');
  assert.equal(visual.productColourStrategy, 'semantic-action-state');
  assert.equal(visual.productCarrierRequired, false);
  assert.equal(visual.motionNoneRequiresStaticBreak, false);
  assert.equal(visual.marketingMotionNoneRequiresStaticBreak, true);
  assert.ok(visual.reviewVerdicts.includes('reality-fit'));
  assert.deepEqual(visual.greenfield, {
    input: 'prompt-only',
    brand: 'supplied-or-explicitly-requested',
    facts: 'verified-or-labelled-demo',
    productDistinction: 'task-model-content-hierarchy-interaction',
    referenceStart: 'domain-product-screens',
    completion: 'desktop-mobile-reality-review',
  });
});

test('quiet product output is not failed merely for refusing decorative theatre', () => {
  const composer = instructions('composer').replace(/\s+/g, ' ');
  const eye = instructions('eye').replace(/\s+/g, ' ');
  assert.match(composer, /A quiet product may intentionally have no decorative carrier or static template break/i);
  assert.match(eye, /Do not fail a product in the quiet register for having no signature moment, decorative carrier, or static template break/i);
  assert.match(read('core/protocol/human-design-loop.md'), /Expression register never changes surface grammar/);
  assert.doesNotMatch(eye, /Clean, competent, and evenly balanced with no nameable departure is a distinction failure \(RED\)\./);
});
