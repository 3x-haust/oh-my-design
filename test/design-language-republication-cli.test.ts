import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import routeInput from './fixtures/adaptive-flow/copy-only.json' with { type: 'json' };
import { readPersistedRoute } from '../core/route/index.ts';
import type { Input } from '../core/design-language/index.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';
import { publishReadingJudgment } from './design-language-judgment-cli.ts';

test('CLI requires a new route-bound reading judgment before replacing an older translation', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-language-republication-cli-'));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  const routePath = '.omd/.cache/route.json';
  const languagePath = '.omd/.cache/language.json';
  try {
    mkdirSync(join(root, '.omd/.cache'), { recursive: true });
    writeFileSync(join(root, routePath), JSON.stringify(routeInput));
    assert.equal(run('route', 'classify', '--input', routePath, '--json').status, 0);
    const original = readPersistedRoute(root, createTestProjectRunInvocation(root));
    const authored: Input = {
      schema: 'design-language-input-v1', kind: 'intake', text: original.request,
      request: original.request, sourceContractSha256: original.sourceContractSha256,
      readings: [{
        id: 'spacing', labelKo: '그룹 간격', origin: { kind: 'model-proposed' },
        targets: [{ id: 'group', metric: 'group-gap', role: 'form', route: '/', selector: 'form',
          viewport: 'desktop', state: 'initial', range: [16, 24], unit: 'px', direction: 'increase', minDelta: 4 }],
        referenceKeywordsEn: ['grouped form rows'], counterSignals: ['touching rows'],
        mustNotMean: ['remove required fields'],
      }], chosenId: 'spacing', decision: 'Separate neighboring groups while preserving their contents.',
    };
    writeFileSync(join(root, languagePath), JSON.stringify(authored));
    const oldJudgment = publishReadingJudgment(root, authored, run);
    const first = run('language', 'translate', '--input', languagePath, '--judgment', oldJudgment, '--json');
    assert.equal(first.status, 0, first.stderr);
    const pointerPath = join(root, '.omd/design-language/intake.json');
    const before = readFileSync(pointerPath);
    writeFileSync(join(root, routePath), JSON.stringify({
      ...routeInput, allowedPaths: [...routeInput.allowedPaths, 'public/build/**'],
    }));
    assert.equal(run('route', 'classify', '--input', routePath, '--json').status, 0);
    const currentRoute = readPersistedRoute(root, createTestProjectRunInvocation(root));
    const current = { ...authored, sourceContractSha256: currentRoute.sourceContractSha256 };
    writeFileSync(join(root, languagePath), JSON.stringify(current));
    const stale = run('language', 'translate', '--input', languagePath, '--judgment', oldJudgment, '--json');
    assert.notEqual(stale.status, 0);
    assert.deepEqual(readFileSync(pointerPath), before);
    const judgment = publishReadingJudgment(root, current, run);
    const refreshed = run('language', 'translate', '--input', languagePath, '--judgment', judgment, '--json');
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.notDeepEqual(readFileSync(pointerPath), before);
    assert.equal(run('language', 'check', '--json').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
