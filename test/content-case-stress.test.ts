import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { checkAllSurfaceContentProofs, checkSurfaceContentProof } from '../core/brief/surface-coverage.ts';
import { fileReceipt, jsonBytes } from '../core/brief/candidate-data.ts';
import type { SurfacePlan } from '../core/frame/process-plan.ts';

test('separate real local content fixtures bind native recipe/pixels and reject relabelled or changed stress evidence', async t => {
  const f = measurementFixture('clean'); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const long = 'Prepare the complete application with the supplied documents and review requirements';
  const many = 'Additional supporting document';
  const error = 'The local preview could not validate this record. Review the supplied documents.';
  const html = `${f.html}<script>const c = new URLSearchParams(location.search).get('case'); if(c==='long')document.querySelector('h1').textContent=${JSON.stringify(long)}; if(c==='many'){const list=document.querySelector('ul');list.replaceChildren(...Array.from({length:8},()=>{const li=document.createElement('li');li.textContent=${JSON.stringify(many)};return li}));} if(c==='error')document.querySelector('section p').textContent=${JSON.stringify(error)};</script>`;
  writeFileSync(join(f.root, 'dist/index.html'), html); writeFileSync(join(f.root, 'src/index.html'), html);
  const cases = [{ id: 'long', kind: 'long-text' as const, text: long, count: 1 }, { id: 'many', kind: 'many-items' as const, text: many, count: 8 }, { id: 'error', kind: 'error' as const, text: error, count: 1 }];
  for (const c of cases) writeFileSync(join(f.root, `.omd/${c.id}.json`), jsonBytes({ schema: 'surface-content-fixture-v1', units: [{ text: c.text, count: c.count }] }));
  const normal = await measureProject({ ...f, entry: 'dist/index.html' });
  const viewId = 'stress-desktop', system = { selectedDirectionSha256: 'a'.repeat(64), effectiveTokensSha256: 'b'.repeat(64) };
  const plan: SurfacePlan = { schema: 'surface-plan-v1', representativeSurfaceId: 'main', views: [{ id: viewId, width: 1280, height: 900 }], surfaces: [{ id: 'main', purpose: 'Review local application material', taskIds: [], componentIds: [], states: [{ id: 'entry', required: true, reason: 'Entry', primaryActionId: null, primaryRequired: false }], viewIds: [viewId], referenceCoverage: 'brief-derived', referenceIds: [], referenceGap: 'Local fixture study', referenceDecision: 'Use real local content stress', contentCases: cases.map(c => ({ id: c.id, kind: c.kind, fixture: fileReceipt(f.root, `.omd/${c.id}.json`), contentProfileId: c.id, stateIds: ['entry'], viewIds: [viewId], expectationIds: ['content-visible'], reason: 'Exercise actual content range' })) }] };
  // A separate normal capture at the identical view ID is required, not baseline-ID substitution.
  const normalAtView = await measureProject({ ...f, entry: 'dist/index.html', scope: { schema: 'visual-measurement-scope-v1', views: [{ id: viewId, viewport: { width: 1280, height: 900 }, browserZoom: 1 }] } });
  const proofs: unknown[] = [];
  for (const c of cases) {
    const result = await measureProject({ ...f, entry: 'dist/index.html', scope: { schema: 'visual-measurement-scope-v1', views: [{ id: viewId, viewport: { width: 1280, height: 900 }, browserZoom: 1,
      state: { name: c.id, startRoute: `/?case=${c.id}`, route: `/?case=${c.id}`, actions: [], assertions: [{ selector: 'main', state: 'visible' }] } }] } });
    const packet = loadMeasurement(f.root, result.packet), view = packet.scope.find(v => v.id === viewId)!;
    const proof = { schema: 'surface-content-proof-v1', surfaceId: 'main', caseId: c.id, stateId: 'entry', viewId,
      fixture: fileReceipt(f.root, `.omd/${c.id}.json`), source: fileReceipt(f.root, 'dist/index.html'), ...system,
      mapping: { surfaceId: 'main', stateId: 'entry', viewId, route: view.route, state: view.state, stateRecipeSha256: view.stateRecipeSha256 },
      packet: result.packet, capture: packet.captures.find(p => p.viewId === viewId)!.capture, normalPacket: normalAtView.packet };
    assert.equal(checkSurfaceContentProof(f.root, plan, proof, system).caseId, c.id);
    assert.throws(() => checkSurfaceContentProof(f.root, plan, { ...proof, packet: normal.packet }, system));
    proofs.push(proof);
  }
  assert.equal(checkAllSurfaceContentProofs(f.root, plan, proofs, system).length, 3);
  assert.throws(() => checkAllSurfaceContentProofs(f.root, plan, proofs.slice(1), system));
  const before = readFileSync(join(f.root, '.omd/visual-measurement.json'));
  writeFileSync(join(f.root, '.omd/long.json'), jsonBytes({ schema: 'surface-content-fixture-v1', units: [{ text: 'Changed fixture', count: 1 }] }));
  assert.throws(() => checkSurfaceContentProof(f.root, plan, proofs[0], system));
  assert.deepEqual(readFileSync(join(f.root, '.omd/visual-measurement.json')), before);
});
