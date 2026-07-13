import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateCopyDeck, validateCopyReviewReport } from '../core/copy/index.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-copy-'));

function deck(scope: 'stateful' | 'navigation-only' | 'static' = 'stateful'): string {
  const stateFields = scope === 'stateful'
    ? `- **Primary copy**: 프로젝트를 선택하세요.\n- **Recovery copy**: 저장하지 못했어요. 입력은 그대로 두었으니 다시 시도하세요.\n- **Primary probe**: .omd/probes/primary.json\n- **Recovery probe**: .omd/probes/recovery.json`
    : scope === 'navigation-only'
      ? `- **Primary copy**: 프로젝트를 선택하세요.\n- **Recovery copy**: N/A — 탐색은 데이터를 변경하지 않습니다.\n- **Primary probe**: .omd/probes/primary.json\n- **Recovery probe**: N/A — 탐색 경로에는 복구 동작이 없습니다.`
      : `- **Primary copy**: 프로젝트 세 편을 읽어보세요.\n- **Recovery copy**: N/A — 정적 소개면에는 복구 상태가 없습니다.\n- **Primary probe**: N/A — 정적 소개면에는 인터랙션 경로가 없습니다.\n- **Recovery probe**: N/A — 정적 소개면에는 복구 경로가 없습니다.`;

  return `# Copy deck

## Sources and fact ledger

| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | 사용자 브리프 | 동시 접속자를 200명에서 5,000명으로 늘렸다. |
| F-002 | fixture | 밀도 테스트 | 카드 제목 예시 |
| F-003 | verified | 사용자 브리프 | Lighthouse 성능 점수를 31점에서 96점으로 높였다. |

## Audience language

- 사용자 인용: “결과부터 보고 싶어요.” — 인터뷰 기록

## Voice contract

- Audience: 성능 병목을 해결할 개발자를 찾는 팀
- Language: ko
- Register: 해요체
- Breath: 한 문장에 한 메시지

## Surface copy

### Home
- Main message: 병목을 찾아 실제 성능을 바꿉니다.
- Supporting fact: 동시 접속자를 200명에서 5,000명으로 늘렸어요.
- Next action: 첫 번째 프로젝트 보기
- Claim refs: F-001

## Navigation and actions

- 첫 번째 프로젝트 보기 → 사례 상세를 열고 개선 전후를 보여줍니다.

## States and recovery

- **Interaction scope**: ${scope}
${stateFields}

## Humanize audit

- 소리 내어 읽었고 해요체를 유지했습니다.
`;
}

function multiSurfaceDeck(): string {
  return deck().replace('## Navigation and actions', `### Case study
- Main message: 느린 화면을 측정 가능한 문제로 바꿉니다.
- Supporting fact: Lighthouse 성능 점수를 31점에서 96점으로 높였어요.
- Next action: 성능 개선 사례 보기
- Claim refs: F-003

## Navigation and actions`);
}

function reviewReport(hash = 'a'.repeat(64)): string {
  return `Mode: copy-editor
Review time: 2026-07-14T12:34:56.000Z
Reviewed copy-deck SHA-256: ${hash}
Verdict: revise
Findings:
- CTA label does not predict the next screen.
`;
}

test('valid Korean surface copy and verified fact refs pass', () => {
  assert.deepEqual(validateCopyDeck(deck()), []);
});

test('missing and empty decks fail, and CLI missing file exits 1 with JSON', () => {
  assert.ok(validateCopyDeck('').some((v) => v.id === 'COPY-MISSING'));
  const dir = project();
  const result = spawnSync(process.execPath, [CLI, 'copy', '--check', '--json'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok((JSON.parse(result.stdout) as Array<{ id: string }>).some((v) => v.id === 'COPY-MISSING'));
});

test('missing or empty required sections fail', () => {
  assert.ok(validateCopyDeck(deck().replace('## Voice contract', '## Voice notes')).some((v) => v.id === 'COPY-SECTION'));
  assert.ok(validateCopyDeck(deck().replace('- 소리 내어 읽었고 해요체를 유지했습니다.', '<!-- empty -->')).some((v) => v.id === 'COPY-SECTION'));
});

test('only exact unresolved sentinels fail; TODO and TBD in normal product copy pass', () => {
  assert.ok(validateCopyDeck(deck().replace('한 문장에 한 메시지', 'TODO')).some((v) => v.id === 'COPY-PLACEHOLDER'));
  assert.ok(validateCopyDeck(deck().replace('한 문장에 한 메시지', '[TODO]')).some((v) => v.id === 'COPY-PLACEHOLDER'));
  assert.ok(validateCopyDeck(deck().replace('한 문장에 한 메시지', '[PLACEHOLDER]')).some((v) => v.id === 'COPY-PLACEHOLDER'));
  assert.ok(validateCopyDeck(deck().replace('한 문장에 한 메시지', '<!-- TBD -->')).some((v) => v.id === 'COPY-PLACEHOLDER'));
  assert.ok(validateCopyDeck(deck().replace('- 소리 내어 읽었고 해요체를 유지했습니다.', 'TODO')).some((v) => v.id === 'COPY-PLACEHOLDER'));
  assert.ok(validateCopyDeck(deck().replace('한 문장에 한 메시지', 'lorem ipsum')).some((v) => v.id === 'COPY-PLACEHOLDER'));
  assert.deepEqual(validateCopyDeck(deck().replace('한 문장에 한 메시지', 'placeholder라는 단어를 설명하는 정상 문장')), []);
  assert.deepEqual(validateCopyDeck(deck().replace('첫 번째 프로젝트 보기', 'TODO 목록 보기')), []);
  assert.deepEqual(validateCopyDeck(deck().replace('한 문장에 한 메시지', 'TBD라는 약어를 설명합니다')), []);
  assert.deepEqual(validateCopyDeck(deck().replace('- Breath:', '- Label: TODO 목록 보기\n- Breath:')), []);
});

test('voice contract requires exactly one Audience, Language, and Register field', () => {
  for (const label of ['Audience', 'Language', 'Register']) {
    const missing = deck().replace(new RegExp(`^- ${label}:.*\\n`, 'm'), '');
    assert.ok(validateCopyDeck(missing).some((v) => v.id === 'COPY-VOICE-CONTRACT' && v.message.includes(label)));
  }
  const duplicate = deck().replace('- Language: ko', '- Language: ko\n- Language: en');
  assert.ok(validateCopyDeck(duplicate).some((v) => v.id === 'COPY-VOICE-CONTRACT' && v.message.includes('Language')));
});

test('invalid interaction scope fails', () => {
  const invalid = deck().replace('Interaction scope**: stateful', 'Interaction scope**: interactive');
  assert.ok(validateCopyDeck(invalid).some((v) => v.id === 'COPY-INTERACTION-SCOPE'));
});

test('interaction scope and state fields must each appear exactly once', () => {
  const duplicateScope = deck().replace('- **Interaction scope**: stateful', '- **Interaction scope**: stateful\n- **Interaction scope**: static');
  assert.ok(validateCopyDeck(duplicateScope).some((v) => v.id === 'COPY-INTERACTION-SCOPE' && /exactly one/.test(v.message)));
  const duplicatePrimary = deck().replace('- **Primary copy**: 프로젝트를 선택하세요.', '- **Primary copy**: 프로젝트를 선택하세요.\n- **Primary copy**: 다른 문구');
  assert.ok(validateCopyDeck(duplicatePrimary).some((v) => v.id === 'COPY-STATE-CONTRACT' && /exactly one Primary copy/.test(v.message)));
});

test('stateful surfaces require recovery copy and both probes', () => {
  const invalid = deck().replace('.omd/probes/recovery.json', 'N/A — 생략');
  assert.ok(validateCopyDeck(invalid).some((v) => /Recovery probe/.test(v.message)));
});

test('navigation-only and static scopes pass with explicit N/A reasons and no fake recovery UI', () => {
  assert.deepEqual(validateCopyDeck(deck('navigation-only')), []);
  assert.deepEqual(validateCopyDeck(deck('static')), []);
});

test('target-language text is not mistaken for analytical metadata', () => {
  const korean = deck().replace('Register: 해요체', 'Register: 해요체\n- 실제 카피: 결과를 먼저 보여드릴게요.');
  assert.deepEqual(validateCopyDeck(korean), []);
});

test('claims reject unknown, fixture, and open fact IDs but allow no-claim surfaces', () => {
  assert.ok(validateCopyDeck(deck().replace('Claim refs: F-001', 'Claim refs: F-999')).some((v) => /unknown/.test(v.message)));
  assert.ok(validateCopyDeck(deck().replace('Claim refs: F-001', 'Claim refs: F-002')).some((v) => /fixture/.test(v.message)));
  const open = deck().replace('| F-002 | fixture |', '| F-002 | open |').replace('Claim refs: F-001', 'Claim refs: F-002');
  assert.ok(validateCopyDeck(open).some((v) => /open/.test(v.message)));
  assert.deepEqual(validateCopyDeck(deck().replace('Claim refs: F-001', 'Claim refs: none')), []);
});

test('each H3 surface independently requires message, fact, action, and strict claim refs', () => {
  assert.deepEqual(validateCopyDeck(multiSurfaceDeck()), []);

  const missingMessage = multiSurfaceDeck().replace('- Main message: 느린 화면을 측정 가능한 문제로 바꿉니다.\n', '');
  assert.ok(validateCopyDeck(missingMessage).some((v) => v.id === 'COPY-SURFACE' && /Case study.*Main message/.test(v.message)));

  const missingRef = multiSurfaceDeck().replace('- Claim refs: F-003\n', '');
  assert.ok(validateCopyDeck(missingRef).some((v) => v.id === 'COPY-SURFACE' && /Case study.*Claim refs/.test(v.message)));

  const garbageRef = multiSurfaceDeck().replace('Claim refs: F-003', 'Claim refs: F-003 from brief');
  assert.ok(validateCopyDeck(garbageRef).some((v) => v.id === 'COPY-CLAIM-REF' && /invalid/.test(v.message)));

  const commaList = multiSurfaceDeck().replace('Claim refs: F-003', 'Claim refs: F-001, F-003');
  assert.deepEqual(validateCopyDeck(commaList), []);
});

test('fact ledger rejects a missing traceable source marker', () => {
  const invalid = deck().replace('| F-001 | verified | 사용자 브리프 |', '| F-001 | verified | N/A |');
  assert.ok(validateCopyDeck(invalid).some((v) => v.id === 'COPY-FACT-LEDGER'));
});

test('CLI accepts a valid non-empty copy deck', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'));
  writeFileSync(join(dir, '.omd', 'copy-deck.md'), deck('navigation-only'));
  const result = spawnSync(process.execPath, [CLI, 'copy', '--check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /passes all structural checks/);
});

test('copy review report gate accepts the exact format without comparing against the current deck', () => {
  assert.deepEqual(validateCopyReviewReport(reviewReport()), []);
  const dir = project();
  mkdirSync(join(dir, '.omd', '.cache'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'copy-deck.md'), deck());
  writeFileSync(join(dir, '.omd', '.cache', 'copy-eye.md'), reviewReport('b'.repeat(64)));
  const result = spawnSync(process.execPath, [CLI, 'copy', '--review-check'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /report-structure checks only/);
  assert.match(result.stdout, /blindness and semantic quality are not proven/);
});

test('forward-test shape without exact mode and reviewed-hash labels fails deterministically', () => {
  const report = `# Copy review
Review time: 2026-07-14T12:34:56Z
Copy editor review completed for the supplied deck.
Verdict: revise
Findings:
- CTA label does not predict the next screen.
`;
  const findings = validateCopyReviewReport(report);
  assert.ok(findings.some((finding) => finding.id === 'COPY-REVIEW-MODE'));
  assert.ok(findings.some((finding) => finding.id === 'COPY-REVIEW-HASH'));
});

test('copy review report rejects invalid time, uppercase hash, empty verdict, and empty findings', () => {
  const invalid = `Mode: copy-editor
Review time: yesterday
Reviewed copy-deck SHA-256: ${'A'.repeat(64)}
Verdict: TBD
Findings:
<!-- empty -->
`;
  const ids = validateCopyReviewReport(invalid).map((finding) => finding.id);
  assert.ok(ids.includes('COPY-REVIEW-TIME'));
  assert.ok(ids.includes('COPY-REVIEW-HASH'));
  assert.ok(ids.includes('COPY-REVIEW-VERDICT'));
  assert.ok(ids.includes('COPY-REVIEW-FINDINGS'));
});

test('copy review CLI missing report fails with stable JSON', () => {
  const dir = project();
  const result = spawnSync(process.execPath, [CLI, 'copy', '--review-check', '--json'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), [{
    id: 'COPY-REVIEW-MISSING',
    path: '.omd/.cache/copy-eye.md',
    message: 'Copy-eye report is missing or empty.',
  }]);
});
