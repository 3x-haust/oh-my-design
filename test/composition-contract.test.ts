import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOSITION_SECTIONS, SYNTHESIS_SECTION, validateCompositionContract, validateCompositionContractSource } from '../core/composition-contract/index.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const temp = (): string => mkdtempSync(join(tmpdir(), 'omd-composition-'));
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

function setup(withScout = true): { root: string; values: Record<string, string> } {
  const root = temp();
  const omd = join(root, '.omd');
  mkdirSync(omd, { recursive: true });
  const values: Record<string, string> = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
  };
  if (withScout) values['scout.md'] = 'scout-v1';
  for (const [name, value] of Object.entries(values)) writeFileSync(join(omd, name), value);
  return { root, values };
}

function artifact(values: Record<string, string>, scoutNA?: string): string {
  const fingerprint = [
    `- Frame SHA-256: ${hash(values['frame.md']!)}`,
    `- Copy deck SHA-256: ${hash(values['copy-deck.md']!)}`,
    `- Type proof SHA-256: ${hash(values['type-proof.md']!)}`,
    scoutNA ? `- Scout SHA-256: N/A — ${scoutNA}` : `- Scout SHA-256: ${hash(values['scout.md']!)}`,
  ].join('\n');
  return COMPOSITION_SECTIONS.map((section) => `## ${section}\n\n${section === 'Input fingerprint' ? fingerprint : `Decision for ${section}.`}`).join('\n\n');
}

test('complete matching composition contract passes', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  assert.deepEqual(validateCompositionContract(root), []);
});

test('pure validator accepts supplied digests without filesystem access', () => {
  const values = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
    'scout.md': 'scout-v1',
  };
  assert.deepEqual(validateCompositionContractSource({
    contract: artifact(values),
    frame: hash(values['frame.md']!),
    copyDeck: hash(values['copy-deck.md']!),
    typeProof: hash(values['type-proof.md']!),
    scout: hash(values['scout.md']!),
  }), []);
});

test('missing and empty required H2 sections fail', () => {
  const { root, values } = setup();
  const missing = artifact(values).replace(/## Media roles[\s\S]*?(?=\n## Responsive recomposition)/, '');
  writeFileSync(join(root, '.omd', 'composition.md'), missing);
  assert.ok(validateCompositionContract(root).some((item) => item.path.endsWith('#Media roles')));
  const empty = artifact(values).replace('## Candidate axes\n\nDecision for Candidate axes.', '## Candidate axes\n\n');
  writeFileSync(join(root, '.omd', 'composition.md'), empty);
  assert.ok(validateCompositionContract(root).some((item) => item.path.endsWith('#Candidate axes')));
});

test('Focal hierarchy is an exact required section', () => {
  const { root, values } = setup();
  const missing = artifact(values).replace(/## Focal hierarchy[\s\S]*?(?=\n## Domain form grammar)/, '');
  writeFileSync(join(root, '.omd', 'composition.md'), missing);
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SECTION' && item.path.endsWith('#Focal hierarchy')));
});

test('bad hash format fails without aesthetic judgment', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values).replace(/Frame SHA-256: [0-9a-f]{64}/, 'Frame SHA-256: abc'));
  const findings = validateCompositionContract(root);
  assert.ok(findings.some((item) => item.id === 'COMPOSITION-HASH'));
  assert.ok(findings.every((item) => !/taste|aesthetic|quality/i.test(item.message)));
});

for (const filename of ['frame.md', 'copy-deck.md', 'type-proof.md', 'scout.md']) {
  test(`changed ${filename} makes composition stale`, () => {
    const { root, values } = setup();
    writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
    writeFileSync(join(root, '.omd', filename), 'changed');
    assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-STALE' && item.path.endsWith(filename)));
  });
}

test('absent scout passes only with an explicit N/A reason', () => {
  const { root, values } = setup(false);
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values, 'No durable scout summary was produced for this run.'));
  assert.deepEqual(validateCompositionContract(root), []);
  writeFileSync(join(root, '.omd', 'composition.md'), artifact({ ...values, 'scout.md': 'fake' }));
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SCOUT'));
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values, 'temporary').replace(/- Scout SHA-256: [^\n]+/, '- Scout SHA-256: N/A —'));
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SCOUT'));
});

test('missing composition file fails explicit command and JSON is stable', () => {
  const { root } = setup(false);
  const missing = spawnSync(process.execPath, [cli, 'composition', '--check', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal((JSON.parse(missing.stdout) as Array<{ id: string }>)[0]?.id, 'COMPOSITION-MISSING');
});

test('CLI exits zero for a fresh contract and emits an empty JSON array', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  const result = spawnSync(process.execPath, [cli, 'composition', '--check', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.ok(readFileSync(join(root, '.omd', 'composition.md'), 'utf8').includes('## Transfer boundary'));
});

// ── Reference synthesis (conditional on user-origin references) ───────────────

const baseInputs = () => {
  const values = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
    'scout.md': 'scout-v1',
  };
  return {
    values,
    digests: {
      frame: hash(values['frame.md']),
      copyDeck: hash(values['copy-deck.md']),
      typeProof: hash(values['type-proof.md']),
      scout: hash(values['scout.md']),
    },
  };
};

test('no user references means no synthesis requirement', () => {
  const { values, digests } = baseInputs();
  assert.deepEqual(validateCompositionContractSource({ contract: artifact(values), ...digests }), []);
});

test('user references without a Reference synthesis section fail', () => {
  const { values, digests } = baseInputs();
  const findings = validateCompositionContractSource({
    contract: artifact(values),
    ...digests,
    userRefLabels: ['linear.app'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /missing or empty/);
});

test('an empty Reference synthesis section fails the same way', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n## ${SYNTHESIS_SECTION}\n\n`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['linear.app'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
});

test('every user reference must be mentioned in the synthesis plan', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n## ${SYNTHESIS_SECTION}\n\n- linear.app: 내비게이션 모델 — 좌측 레일과 현재 위치 마킹을 받은함 셸에 적용.`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['linear.app', 'notion.so'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /notion\.so/);
});

test('a synthesis plan naming every user reference passes, case-insensitively', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n## ${SYNTHESIS_SECTION}\n\n- Linear.app: 내비게이션 모델을 셸에 적용.\n- NOTION.SO: 콘텐츠 밀도 규칙은 사용하지 않기로 함 — 문서형 밀도가 큐 스캔과 충돌 (decline).`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['linear.app', 'notion.so'],
  });
  assert.deepEqual(findings, []);
});

test('filesystem adapter derives user reference labels from origin: user records', () => {
  const { root, values } = setup();
  const refsDir = join(root, '.omd', 'refs');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(refsDir, 'linear.app.page.json'), JSON.stringify({
    source: 'https://linear.app/features', component: 'page', kind: 'page', capturedAt: '2026-01-01',
    invariants: null, principles: [], origin: 'user',
  }));
  writeFileSync(join(refsDir, 'stripe.com.page.json'), JSON.stringify({
    source: 'https://stripe.com', component: 'page', kind: 'page', capturedAt: '2026-01-01',
    invariants: null, principles: [], origin: 'scout',
  }));
  // No synthesis section: only the user ref (linear.app) should be demanded, not the scout ref.
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  const findings = validateCompositionContract(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /missing or empty/);

  const withPlan = `${artifact(values)}\n\n## ${SYNTHESIS_SECTION}\n\n- linear.app: 검색·필터 인터랙션을 목록 툴바에 적용.`;
  writeFileSync(join(root, '.omd', 'composition.md'), withPlan);
  assert.deepEqual(validateCompositionContract(root), []);
});
