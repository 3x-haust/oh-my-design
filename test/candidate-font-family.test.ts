import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateContentProjection, checkCandidatePreview, publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { fileReceipt, readReceipt } from '../core/brief/candidate-data.ts';
import { conformance } from '../core/measure/conformance.ts';
import { measureProject } from '../core/measure/index.ts';
import { parseVisualMeasurement } from '../core/measure/schema.ts';
import type { MeasuredIr } from '../core/measure/types.ts';
import type { MinimalTokenCommit } from '../core/tokens/minimal.ts';
import { fixture, seed, snapshot, write } from './helpers/phase6-process.ts';

test('computed system font aliases preserve candidate and type contracts', { timeout: 120_000 }, async t => {
  for (const variant of [
    { name: 'native system alias', css: 'BlinkMacSystemFont,sans-serif', pass: true },
    { name: 'different primary family', css: 'serif,sans-serif', pass: false },
    { name: 'reordered fallback', css: 'sans-serif,BlinkMacSystemFont', pass: false },
  ]) await t.test(variant.name, async st => {
    const f = fixture(st);
    const stack = ['BlinkMacSystemFont', 'sans-serif'];
    const tokens: MinimalTokenCommit = { ...seed, primitives: {
      ...seed.primitives, family: { type: 'font-family', value: stack },
    } };
    write(f.root, '.omd/tokens.json', JSON.stringify(tokens));
    const plan = { ...f.plan, tokens: fileReceipt(f.root, '.omd/tokens.json'),
      content: { ...f.plan.content, projectionSha256: candidateContentProjection(f.root, f.content) } };
    publishCandidatePlan(f.root, plan, f.writer, f.invocation);
    const path = '.omd/.cache/sketches/A/index.html';
    write(f.root, path, `<!doctype html><html><head><title>Font alias</title><style>body{margin:24px;font:400 16px/1.5 ${variant.css};color:#111;background:white}p{font:inherit;margin:24px 0}</style></head><body>${f.content.units.map(unit => `<p data-omd-content-id="${unit.id}" data-omd-text-style="body">${unit.text}</p>`).join('')}</body></html>`);
    const measured = await measureProject({ root: f.root, entry: path, writer: f.writer, invocation: f.invocation });
    const packet = parseVisualMeasurement(JSON.parse(readReceipt(f.root, measured.packet).toString('utf8')));
    const source = fileReceipt(f.root, path), before = snapshot(f.root);
    for (const capture of packet.captures) {
      const scope = packet.scope.find(view => view.id === capture.viewId);
      assert.ok(scope);
      const raw: MeasuredIr = JSON.parse(readReceipt(f.root, capture.ir).toString('utf8'));
      const result = conformance(raw.measurement, {
        tokens, composition: null, errors: [],
        selectedAssignments: Object.fromEntries(f.content.units.map(unit => [unit.id, 'body'])),
        type: { schema: 'type-proof-contract-v1', families: [{ id: 'system', stack }],
          roles: [{ id: 'body', familyId: 'system', size: 16, weights: [400], leading: 1.5, minimumReadablePx: 14, required: true }],
          assignments: [], defaultTextRole: 'body', requiredViews: [] },
      }, capture.viewId);
      const familyIssues = result.issues.filter(issue => issue.code === 'TYPE_ROLE_FAMILY_MISMATCH');
      if (variant.pass) assert.deepEqual(familyIssues, []);
      else assert.ok(familyIssues.length > 0);
      const check = () => checkCandidatePreview(f.root, {
        renderId: `${measured.packet.sha256}:${capture.viewId}`, sourceSha256: source.sha256,
        surfaceId: 'main', stateId: 'initial', viewId: capture.viewId,
        viewport: scope.viewport, png: capture.capture, capture: measured.packet,
      }, source, plan, f.content, tokens);
      if (variant.pass) assert.doesNotThrow(check);
      else assert.throws(check, /type treatment differs/);
    }
    assert.deepEqual(snapshot(f.root), before);
  });
});
