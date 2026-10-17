import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFunctionalCompleteness, validateFunctionalRequirements } from '../core/completeness/index.ts';
import type { RawNode } from '../core/types.ts';

// The visual gates cannot tell a landing that links to the repository from one that only says it
// does. This gate correlates the brief's stated requirements with the built page and adds no style
// rule of its own: present, operable, reachable.

const requirements = (...entries: Record<string, unknown>[]) => ({ schema: 'functional-requirements-v1', requirements: entries });

const node = (overrides: Partial<RawNode> & { id: string }): RawNode => ({
  name: overrides.id, type: 'TEXT', path: `body > ${overrides.id}`, parent: null, children: [],
  box: { x: 0, y: 0, w: 100, h: 40 }, ...overrides,
} as RawNode);

test('a requirement schema rejects duplicate, unlabelled, and unknown-kind entries', () => {
  assert.equal(validateFunctionalRequirements(requirements({ id: 'R-1', kind: 'action', statement: 'open', label: 'Open' })).requirements.length, 1);
  assert.throws(() => validateFunctionalRequirements(requirements({ id: 'R-1', kind: 'action', statement: 'a', label: 'A' }, { id: 'R-1', kind: 'action', statement: 'b', label: 'B' })), /duplicate requirement R-1/);
  assert.throws(() => validateFunctionalRequirements(requirements({ id: 'R-1', kind: 'guess', statement: 'a', label: 'A' })), /kind must be one of/);
  assert.throws(() => validateFunctionalRequirements(requirements({ id: 'R-1', kind: 'action', statement: 'a', label: '  ' })), /needs a non-empty label/);
  assert.throws(() => validateFunctionalRequirements(requirements({ id: '1', kind: 'action', statement: 'a', label: 'A' })), /id must be R-<number>/);
});
test('functional requirements ignore ordinary extra fields but preserve required-field validation', () => {
  const item = { id: 'R-1', kind: 'action', statement: 'open', label: 'Open' };
  assert.deepEqual(validateFunctionalRequirements({ ...requirements({ ...item, note: 'optional' }), note: 'optional' }),
    validateFunctionalRequirements(requirements(item)));
  assert.throws(() => validateFunctionalRequirements(requirements({ id: 'R-1', kind: 'action', statement: 'open' })), /label/);
});
test('an action is satisfied only when its carrier is operable and keyboard-reachable', () => {
  const declared = validateFunctionalRequirements(requirements({ id: 'R-1', kind: 'action', statement: 'Visitor opens the repository', label: '저장소 열기' }));

  assert.deepEqual(checkFunctionalCompleteness(declared, [node({ id: 'a', text: '저장소 열기', interactive: true, focusable: true })]), []);

  const inert = checkFunctionalCompleteness(declared, [node({ id: 'a', text: '저장소 열기' })]);
  assert.deepEqual(inert.map((finding) => finding.id), ['FUNC-INERT']);

  const unreachable = checkFunctionalCompleteness(declared, [node({ id: 'a', text: '저장소 열기', interactive: true, focusable: false })]);
  assert.deepEqual(unreachable.map((finding) => finding.id), ['FUNC-UNREACHABLE']);

  const absent = checkFunctionalCompleteness(declared, [node({ id: 'a', text: '다른 문구' })]);
  assert.deepEqual(absent.map((finding) => finding.id), ['FUNC-MISSING']);
});

test('a label inside an interactive ancestor still counts, and content needs only presence', () => {
  const declared = validateFunctionalRequirements(requirements(
    { id: 'R-1', kind: 'preference', statement: 'Visitor switches language', label: 'English' },
    { id: 'R-2', kind: 'content', statement: 'Scope is stated', label: '지원 범위' },
  ));
  const nodes = [
    node({ id: 'btn', text: '', interactive: true, focusable: true, children: ['label'] }),
    node({ id: 'label', text: 'English', parent: 'btn' }),
    node({ id: 'scope', text: '지원 범위는 다음과 같습니다' }),
  ];
  assert.deepEqual(checkFunctionalCompleteness(declared, nodes), []);
});

test('a wrapping label connects its text sibling to the keyboard-reachable control', () => {
  const declared = validateFunctionalRequirements(requirements(
    { id: 'R-1', kind: 'action', statement: 'Visitor confirms the entered details', label: '입력 내용을 확인했습니다.' },
  ));
  const wired = [
    node({ id: 'label', name: 'label.checkbox', children: ['input', 'text'] }),
    node({ id: 'input', parent: 'label', interactive: true, focusable: true }),
    node({ id: 'text', text: '입력 내용을 확인했습니다.', parent: 'label' }),
  ];
  assert.deepEqual(checkFunctionalCompleteness(declared, wired), []);

  const unrelated = [
    node({ id: 'copy', text: '입력 내용을 확인했습니다.' }),
    node({ id: 'elsewhere', interactive: true, focusable: true }),
  ];
  assert.deepEqual(
    checkFunctionalCompleteness(declared, unrelated).map((finding) => finding.id),
    ['FUNC-INERT'],
  );
});

test('a form label with no interactive field nearby is reported as inert', () => {
  const declared = validateFunctionalRequirements(requirements({ id: 'R-1', kind: 'form', statement: 'Visitor submits an email', label: '이메일' }));
  const wired = [
    node({ id: 'row', children: ['label', 'input'] }),
    node({ id: 'label', text: '이메일', parent: 'row' }),
    node({ id: 'input', parent: 'row', interactive: true, focusable: true }),
  ];
  assert.deepEqual(checkFunctionalCompleteness(declared, wired), []);

  const orphan = [node({ id: 'label', text: '이메일' })];
  assert.deepEqual(checkFunctionalCompleteness(declared, orphan).map((finding) => finding.id), ['FUNC-FORM-INERT']);
});
