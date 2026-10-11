import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { withBrowser } from '../core/render/index.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { readCurrentDirectDiscoveryEntry, readCurrentDiscoveryNavigation } from '../core/ref/discovery-record.ts';
import { readCurrentReferenceDiscoveryEvidence } from '../core/ref/discovery-evidence.ts';
import { loadRefs } from '../core/ref/store.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, discoveryFixture, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';

for (const entry of [undefined, 'free-gallery'] as const) {
  test(`${entry ?? 'navigation'} publishes long visible text within its signed reader contract`, async t => {
    const root = discoveryFixture(t);
    const task = 'A visible task record with a date, status and next action. '.repeat(110).trim();
    assert.ok(task.length > 4096);
    const receipt = await withBrowser(async browser => {
      const observed = discoveryBrowser(browser, {
        url: GALLERY_DIRECTORY,
        html: `<main><h1>Task records</h1><a href="${GALLERY_ITEM}">Inspect record</a><p style="font:12px/14px Arial;margin:0">${task}</p></main>`,
      });
      return captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design',
        createTestProjectWriteAdapter(root), entry);
    });
    const observation = entry === undefined
      ? readCurrentDiscoveryNavigation(root, receipt)
      : readCurrentDirectDiscoveryEntry(root, { ...receipt, method: 'direct-public', entry });
    const record: Record<string, unknown> = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    for (const field of ['observedText', 'taskText'] as const) {
      const value = record[field];
      assert.equal(typeof value, 'string');
      assert.ok(typeof value === 'string');
      assert.ok(value.length > 4000 && value.length <= 4096);
      assert.equal(value.trim(), value);
      assert.ok(value.includes(task.slice(0, 100)));
    }
    assert.equal(observation.observedText, record.observedText);
    assert.equal(observation.taskText, record.taskText);
    const evidence = readCurrentReferenceDiscoveryEvidence(root).design;
    assert.equal(evidence.ignored, 0);
    assert.equal((entry === undefined ? evidence.visits : evidence.entries).length, 1);
    assert.ok('evidence' in receipt);
    const png = readFileSync(join(root, receipt.evidence.path));
    assert.equal(png.readUInt32BE(16), 2560);
    assert.equal(png.readUInt32BE(20), 1800);
    assert.equal(loadRefs(root, { includeDomain: true }).length, 0);
  });
}
