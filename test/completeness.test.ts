import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFunctionalCompleteness, validateFunctionalRequirements } from '../core/completeness/index.ts';
import type { RawNode } from '../core/types.ts';

// The visual gates cannot tell a landing that links to the repository from one that only says it
// does. This gate correlates the brief's stated requirements with the built page and adds no style
// rule of its own: present, operable, reachable.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/completeness.html', import.meta.url));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-complete-'));

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

test('the gate runs against a real page and separates satisfied from unsatisfied requirements', () => {
  const dir = project();
  const write = (relative: string, content: string): string => {
    const path = join(dir, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
    return path;
  };

  const satisfied = write('satisfied.json', JSON.stringify(requirements(
    { id: 'R-1', kind: 'action', statement: 'Visitor opens the repository', label: '저장소 열기' },
    { id: 'R-2', kind: 'preference', statement: 'Visitor switches language', label: 'English' },
    { id: 'R-3', kind: 'form', statement: 'Visitor submits an email', label: '이메일' },
  )));
  const passing = run(['complete', 'check', FIXTURE, '--input', satisfied, '--json'], dir);
  assert.equal(passing.status, 0, passing.stdout || passing.stderr);
  assert.deepEqual(JSON.parse(passing.stdout).findings, []);

  const unmet = write('unmet.json', JSON.stringify(requirements(
    { id: 'R-1', kind: 'action', statement: 'Visitor starts a trial', label: '무료로 시작' },
    { id: 'R-2', kind: 'action', statement: 'Visitor triggers the hidden action', label: '숨은 동작' },
  )));
  const blocked = run(['complete', 'check', FIXTURE, '--input', unmet, '--json'], dir);
  assert.equal(blocked.status, 1, blocked.stdout);
  assert.deepEqual(JSON.parse(blocked.stdout).findings.map((finding: { id: string }) => finding.id), ['FUNC-MISSING', 'FUNC-UNREACHABLE']);
});

// The framer owns the requirement list because it is the role that interrogates the brief, and it
// persists through the CLI like its other artifacts rather than writing the file directly.

test('the framer owns and persists functional requirements through the CLI', () => {
  const framer = readFileSync(fileURLToPath(new URL('../src/agents/framer.agent.yaml', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.match(framer, /Bash\(omd complete:\*\)/);
  assert.match(framer, /You also own `\.omd\/functional-requirements\.json` as `functional-requirements-v1`/);
  assert.match(framer, /persist the visitor's declared affordances with `omd complete set --input <functional-requirements\.json>`/);

  const skill = readFileSync(fileURLToPath(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url)), 'utf8');
  assert.match(skill, /\| `\.omd\/functional-requirements\.json` \| `omd-framer` \| §1 \|/);
  assert.match(skill, /\| `\.omd\/delivery\.jsonl`, `\.omd\/stage-usage\.jsonl` \| the `omd stage` CLI \(never hand-edited\) \| §0–§9 \|/);
  assert.match(skill, /`\.omd\/locale\.json` is the other coordinator-owned routing input/);
});

test('complete set validates before persisting and rejects an invalid list', () => {
  const dir = project();
  const path = join(dir, 'requirements.json');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(requirements({ id: 'R-1', kind: 'action', statement: 'Visitor opens the repository', label: '저장소 열기' })));
  const stored = run(['complete', 'set', '--input', path, '--json'], dir);
  assert.equal(stored.status, 0, stored.stderr);
  assert.equal(JSON.parse(stored.stdout).requirements, 1);
  assert.match(readFileSync(join(dir, '.omd/functional-requirements.json'), 'utf8'), /"id": "R-1"/);

  writeFileSync(path, JSON.stringify(requirements({ id: 'R-1', kind: 'wish', statement: 'a', label: 'A' })));
  const rejected = run(['complete', 'set', '--input', path], dir);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /FUNCTIONAL_REQUIREMENTS_INVALID/);
});
