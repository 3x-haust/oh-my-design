import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkExpansionContract } from '../core/brief/expansion.ts';
import { requiredSurfaceCells } from '../core/frame/process-plan.ts';
import { surfacePlan } from './helpers/phase6-process.ts';

const components = [{ id: 'details', users: [{ surfaceId: 'main', stateId: 'initial' }, { surfaceId: 'details', stateId: 'initial' }],
  variants: ['default'], tokenRoles: ['body'], sizing: 'Intrinsic content height', overflow: 'Wrap long content', reuse: { componentId: null, reason: 'No existing component variant is approved.' } }];
const cells = requiredSurfaceCells(surfacePlan).map(c => ({ ...c, route: c.surfaceId === 'main' ? '/' : '/details', state: 'initial', stateRecipeSha256: 'a'.repeat(64) }));
const markdown = (items: unknown, mapping: unknown) => `## Needed components\n\`\`\`json\n${JSON.stringify({ schema: 'needed-components-v1', components: items })}\n\`\`\`\n## Expansion mapping\n\`\`\`json\n${JSON.stringify({ schema: 'surface-expansion-v1', cells: mapping })}\n\`\`\`\n`;

test('selected system contains exactly needed components and every per-surface expansion cell', () => {
  assert.equal(checkExpansionContract(markdown(components, cells), surfacePlan, ['body']).cells.length, 3);
  assert.throws(() => checkExpansionContract(markdown([...components, { ...components[0], id: 'unused-modal' }], cells), surfacePlan, ['body']));
  assert.throws(() => checkExpansionContract(markdown(components, cells.slice(0, 2)), surfacePlan, ['body']));
  assert.throws(() => checkExpansionContract(markdown(components, [...cells, cells[0]]), surfacePlan, ['body']));
  assert.throws(() => checkExpansionContract(markdown(components, cells), surfacePlan, []));
  assert.equal(checkExpansionContract(markdown(components, cells), surfacePlan, ['body']).components.length, 1);
});
