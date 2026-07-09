import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFrame, isApproved } from '../core/frame/index.ts';
import { preTool } from '../core/hook/dispatch.ts';
import { must } from './helpers.ts';

function project(frameMd: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'omd-'));
  if (frameMd !== null) {
    mkdirSync(join(dir, '.design'), { recursive: true });
    writeFileSync(join(dir, '.design', 'frame.md'), frameMd);
  }
  return dir;
}

const APPROVED = `---
approved: true
generator: "친구의 추천"
---

## 재프레이밍
결정 마비 문제다.
`;

const PENDING = `---
approved: false
---

## 재프레이밍
가설입니다.
`;

test('readFrame parses frontmatter and body', () => {
  const f = must(readFrame(project(APPROVED)), 'frame');
  assert.equal(f.approved, true);
  assert.equal(f.generator, '친구의 추천');
  assert.ok(f.body.includes('결정 마비'));
});

test('readFrame returns null when there is no frame', () => {
  assert.equal(readFrame(project(null)), null);
});

test('isApproved is false for missing, pending, and malformed frames', () => {
  assert.equal(isApproved(project(null)), false);
  assert.equal(isApproved(project(PENDING)), false);
  assert.equal(isApproved(project('no frontmatter at all')), false);
  assert.equal(isApproved(project('---\napproved: "yes"\n---\n')), false); // string, not boolean
  assert.equal(isApproved(project(APPROVED)), true);
});

// ── The gate. This is the single defence line after dropping MCP. ──

test('preTool allows the write when the frame is approved', async () => {
  const r = await preTool({ cwd: project(APPROVED) });
  assert.equal(r.decision, 'allow');
});

test('preTool denies the write when the frame is not approved', async () => {
  const r = await preTool({ cwd: project(PENDING) });
  assert.equal(r.decision, 'deny');
  assert.ok(r.reason.includes('omd frame approve'));
});

test('preTool denies when there is no frame at all', async () => {
  const r = await preTool({ cwd: project(null) });
  assert.equal(r.decision, 'deny');
});

test('preTool FAILS CLOSED — an internal crash denies rather than allows', async () => {
  const boom = () => { throw new Error('disk on fire'); };
  const r = await preTool({ cwd: project(APPROVED) }, { isApproved: boom });
  assert.equal(r.decision, 'deny');
  assert.ok(/disk on fire/.test(r.reason));
});

test('preTool honours the --no-frame escape hatch via env', async () => {
  const r = await preTool({ cwd: project(PENDING), env: { OMD_NO_FRAME: '1' } });
  assert.equal(r.decision, 'allow');
});
