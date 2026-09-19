import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COPY_SPECIFICITY_SCHEMA,
  copySpecificitySha256,
  readCopySpecificity,
} from '../core/copy/specificity.ts';

const brief = {
  coreObjects: ['benefit application', 'supporting document'],
  surfaces: ['eligibility check', 'application status'],
};

test('the check flags a line that could ship from any product in the category', () => {
  const findings = readCopySpecificity({
    markdown: [
      '## Surface copy',
      '',
      'We provide a seamless and intuitive experience for everyone who needs help.',
    ].join('\n'),
    ...brief,
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.text, /seamless/);
  assert.match(findings[0]!.reviewQuestion, /ship unchanged from another product/);
});

test('a line naming a real object, surface, number, or user phrase is not flagged', () => {
  for (const line of [
    'Check whether you qualify for a benefit application in about 3 minutes.',
    'Your application status shows what is still missing.',
    '치매 어르신 돌봄 신청은 지원 문서 두 건이 필요합니다',
    'BenefitsCal handles the official submission.',
  ]) {
    const findings = readCopySpecificity({ markdown: line, ...brief });
    assert.deepEqual(findings, [], line);
  }
});

test('the user own words anchor a line even when nothing else does', () => {
  const withUserLanguage = readCopySpecificity({
    markdown: 'We make the whole thing effortless and delightful for you.',
    coreObjects: [],
    surfaces: [],
    userLanguage: ['effortless'],
  });
  assert.deepEqual(withUserLanguage, []);
});

test('short functional labels are left alone', () => {
  const findings = readCopySpecificity({ markdown: '## Navigation\n\nCancel\nSave and continue\nNext', ...brief });
  assert.deepEqual(findings, [], 'a two-word label is specific by being functional, not by naming a noun');
});

test('structural lines are not surface copy and are skipped', () => {
  const markdown = [
    '# Copy deck',
    '| ID | Status | Source | Fact |',
    '| --- | --- | --- | --- |',
    '| F-001 | verified | User brief | Exact supported fact |',
    '- **Owner**: omd-writer',
  ].join('\n');
  assert.deepEqual(readCopySpecificity({ markdown, ...brief }), []);
});

test('a long abstraction with no anchor is flagged even without a quality adjective', () => {
  const findings = readCopySpecificity({
    markdown: 'Our platform helps teams work together more effectively across every stage of the journey.',
    coreObjects: [],
    surfaces: [],
  });
  assert.equal(findings.length, 1, 'length plus abstraction is the signal, not one adjective from a list');
});

test('the finding names which anchors were missing and carries its line number', () => {
  const markdown = ['# Deck', '', 'A powerful and innovative solution for your needs.'].join('\n');
  const findings = readCopySpecificity({ markdown, ...brief });
  assert.equal(findings[0]!.line, 3);
  assert.deepEqual([...findings[0]!.missing], ['object', 'number', 'user-language', 'named-surface', 'proper-noun']);
});

test('the reading is stable for identical copy', () => {
  const input = { markdown: 'A seamless and powerful experience for everyone.', ...brief };
  assert.equal(copySpecificitySha256(readCopySpecificity(input)), copySpecificitySha256(readCopySpecificity(input)));
  assert.notEqual(
    copySpecificitySha256(readCopySpecificity(input)),
    copySpecificitySha256(readCopySpecificity({ markdown: 'Check your application status.', ...brief })),
  );
  assert.equal(COPY_SPECIFICITY_SCHEMA, 'copy-specificity-v1');
});
