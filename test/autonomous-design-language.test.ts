import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishTranslation, readTranslation } from '../core/design-language/index.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { fixture } from './helpers/native-maker.ts';

test('native default selects a reading without recording a user answer', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const reading = {
    id: 'spacing', labelKo: '내용 그룹 간격', origin: { kind: 'model-proposed' },
    targets: [{ id: 'groups', metric: 'group-gap', role: 'form', route: '/', selector: 'form',
      viewport: 'desktop', state: 'initial', range: [16, 24], unit: 'px', direction: 'increase', minDelta: 4 }],
    referenceKeywordsEn: ['grouped form rows'], counterSignals: ['crowded groups'],
    mustNotMean: ['remove required fields'],
  };
  const input = {
    schema: 'design-language-input-v1', kind: 'intake', text: route.request,
    request: route.request, sourceContractSha256: route.sourceContractSha256,
    readings: [reading, { ...reading, id: 'hierarchy' }], chosenId: 'spacing',
    decision: 'Preserve every field and separate the observed groups.',
  };
  publishTranslation(context.root, context.invocation, context.writer, 'intake', input);
  const result = readTranslation(context.root, 'intake', route);
  assert.equal(result?.translation.status, 'resolved');
  assert.equal(result?.translation.answerTo, null);
  assert.equal(result?.translation.question, null);
  const pointer = JSON.parse(readFileSync(join(context.root, '.omd/design-language/intake.json'), 'utf8'));
  assert.equal(JSON.parse(readFileSync(join(context.root, pointer.record), 'utf8')).decisionActor, 'harness');
});

test('native default refuses a new design question before publishing a waiting state', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const reading = {
    id: 'spacing', labelKo: '내용 그룹 간격', origin: { kind: 'model-proposed' },
    targets: [{ id: 'groups', metric: 'group-gap', role: 'form', route: '/', selector: 'form',
      viewport: 'desktop', state: 'initial', range: [16, 24], unit: 'px', direction: 'increase', minDelta: 4 }],
    referenceKeywordsEn: ['grouped form rows'], counterSignals: ['crowded groups'],
    mustNotMean: ['remove required fields'],
  };
  const input = {
    schema: 'design-language-input-v1', kind: 'intake', text: route.request,
    request: route.request, sourceContractSha256: route.sourceContractSha256,
    readings: [reading, { ...reading, id: 'hierarchy' }], chosenId: null,
    decision: 'Two possible readings.',
    question: { textKo: '어느 쪽인가요?', answerId: null, options: [
      { readingId: 'spacing', thumbnailPath: '.omd/refs/design/a.png', captureSha256: 'a'.repeat(64) },
      { readingId: 'hierarchy', thumbnailPath: '.omd/refs/design/b.png', captureSha256: 'b'.repeat(64) },
    ] },
  };
  assert.throws(() => publishTranslation(context.root, context.invocation, context.writer, 'intake', input),
    /DESIGN_LANGUAGE_AUTONOMOUS_SELECTION_REQUIRED/);
  assert.equal(existsSync(join(context.root, '.omd/design-language/intake.json')), false);
});
