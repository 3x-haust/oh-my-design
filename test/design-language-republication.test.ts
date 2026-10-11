import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import routeInput from './fixtures/adaptive-flow/copy-only.json' with { type: 'json' };
import { readPersistedRoute } from '../core/route/index.ts';
import { publishTranslation, readTranslation, type Input } from '../core/design-language/index.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';

function changedRouteFixture() {
  const root = mkdtempSync(join(tmpdir(), 'omd-language-republication-'));
  const originalInvocation = publishTestAdaptiveRoute(root, routeInput);
  const originalRoute = readPersistedRoute(root, originalInvocation);
  const authored: Input = {
    schema: 'design-language-input-v1', kind: 'intake', text: originalRoute.request,
    request: originalRoute.request, sourceContractSha256: originalRoute.sourceContractSha256,
    readings: [], chosenId: null, decision: 'No additional visual interpretation is required.',
  };
  const previous = publishTranslation(root, originalInvocation,
    createTestProjectWriteAdapter(root, originalInvocation), 'intake', authored);
  writeFileSync(join(root, 'index.html'), '<main>unchanged</main>');
  const invocation = publishTestAdaptiveRoute(root, {
    ...routeInput, allowedPaths: [...routeInput.allowedPaths, 'public/build/**'],
  });
  const route = readPersistedRoute(root, invocation);
  assert.notEqual(route.sourceContractSha256, originalRoute.sourceContractSha256);
  const writer = createTestProjectWriteAdapter(root, invocation);
  return { root, invocation, route, writer, authored, previous,
    current: { ...authored, sourceContractSha256: route.sourceContractSha256 } };
}

test('current translation can replace a historical route-bound translation without making history current', () => {
  const f = changedRouteFixture();
  try {
    assert.throws(() => readTranslation(f.root, 'intake', f.route), /DESIGN_LANGUAGE_STALE/);
    const previousBytes = readFileSync(join(f.root, f.previous.record));
    const next = publishTranslation(f.root, f.invocation, f.writer, 'intake', f.current);
    assert.notEqual(next.sha256, f.previous.sha256);
    assert.equal(readTranslation(f.root, 'intake', f.route)?.sha256, next.sha256);
    assert.deepEqual(readFileSync(join(f.root, f.previous.record)), previousBytes);
    assert.equal(readFileSync(join(f.root, 'index.html'), 'utf8'), '<main>unchanged</main>');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('old-context input cannot replace the stale pointer during republication', () => {
  const f = changedRouteFixture();
  try {
    const pointerPath = join(f.root, '.omd/design-language/intake.json');
    const before = readFileSync(pointerPath);
    assert.throws(() => publishTranslation(f.root, f.invocation, f.writer, 'intake', f.authored),
      /DESIGN_LANGUAGE_STALE/);
    assert.deepEqual(readFileSync(pointerPath), before);
    assert.equal(readFileSync(join(f.root, 'index.html'), 'utf8'), '<main>unchanged</main>');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('corrupt historical bytes still refuse current-context republication without mutation', () => {
  const f = changedRouteFixture();
  try {
    const pointerPath = join(f.root, '.omd/design-language/intake.json');
    const before = readFileSync(pointerPath);
    writeFileSync(join(f.root, f.previous.record), '{}\n');
    assert.throws(() => publishTranslation(f.root, f.invocation, f.writer, 'intake', f.current),
      /DESIGN_LANGUAGE_STALE/);
    assert.deepEqual(readFileSync(pointerPath), before);
    assert.equal(readFileSync(join(f.root, 'index.html'), 'utf8'), '<main>unchanged</main>');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
