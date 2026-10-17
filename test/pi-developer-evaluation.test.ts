import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { registerDeveloperEvaluation } from '../extensions/omd-developer-evaluation.ts';
import { captureDesignExecutionPolicy } from '../core/config/design-execution.ts';
import type { PortablePiApi, PortablePiCommand } from '../extensions/omd-runtime.ts';
import { collectDeveloperInterview } from '../extensions/omd-developer-interview.ts';

test('held-out satisfaction rates its named trial even when the control is preferred', async () => {
  const selections = ['A가 더 좋다', '만족스럽지 않다', '특별히 없음', '현재안을 유지한다', '이번 비교 기록만 보관'];
  const result = await collectDeveloperInterview({ cwd: '/unused', ui: {
    notify() {},
    select: async (_title, options) => {
      const answer = selections.shift();
      assert.ok(answer && options.includes(answer));
      return answer;
    },
  } }, false, false, 'b');
  assert.ok(result);
  assert.equal(result.humanResponse.comparisonChoice, 'a');
  assert.equal(result.humanResponse.satisfactionCandidate, 'b');
  assert.equal(result.humanResponse.satisfaction, 'unsatisfied');
  assert.equal(selections.length, 0);
});

test('normal host never registers or enters a developer interview', () => {
  const names: string[] = [];
  const pi: PortablePiApi = {
    registerCommand: name => { names.push(name); }, registerTool() {},
    async exec() { throw new Error('normal startup must not launch a process'); },
  };
  registerDeveloperEvaluation(pi, captureDesignExecutionPolicy({}), '/unused');
  assert.deepEqual(names, []);
});

for (const withReferences of [false, true]) test(`explicit developer comparison displays exact ${withReferences ? 'reference and result' : 'result'} images before collecting genuine answers`, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-interview-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'project');
  const home = join(directory, 'private');
  mkdirSync(root);
  const images = (withReferences ? ['a.png', 'b.png', 'reference-a.png', 'reference-b.png'] : ['a.png', 'b.png']).map((name, index) => {
    const path = join(root, name);
    const png = new PNG({ width: 2, height: 2 });
    png.data.fill(255 - index * 50);
    writeFileSync(path, PNG.sync.write(png));
    return path;
  });
  let command: PortablePiCommand | undefined;
  const events: string[] = [];
  const displayed: string[] = [];
  const handoffs: string[] = [];
  const notices: string[] = [];
  const pi: PortablePiApi = {
    registerCommand(name, value) { assert.equal(name, 'omd-evaluate'); command = value; },
    registerTool() {},
    async exec() { throw new Error('evaluation must use existing results, not a second engine'); },
    sendMessage(message) {
      if (message.customType === 'omd-developer-evaluation-record') {
        assert.equal(typeof message.content, 'string');
        if (typeof message.content === 'string') handoffs.push(message.content);
        return;
      }
      events.push('images');
      assert.ok(Array.isArray(message.content));
      const delivered = message.content.filter(part => part.type === 'image');
      displayed.push(...delivered.map(part => part.data));
      assert.equal(delivered.length, withReferences ? 4 : 2);
      assert.deepEqual(delivered.map(part => part.data).sort(),
        images.map(path => readFileSync(path).toString('base64')).sort());
    },
  };
  registerDeveloperEvaluation(pi, captureDesignExecutionPolicy({ OMD_DESIGN_MODE: 'developer-evaluation' }), home);
  assert.ok(command);
  const selections = [
    '허용', '화면을 확인했습니다',
    ...(withReferences ? ['레퍼런스 A가 더 좋다'] : []),
    'B가 더 좋다', withReferences ? '만족스럽지 않다' : '만족한다',
    ...(withReferences ? ['원본에서는 좋지만 우리 콘텐츠에는 맞지 않는다'] : []),
    '특별히 없음', '현재안을 유지한다', '이 작업 맥락에서만 재사용 허용',
  ];
  await command.handler(`compare ${JSON.stringify(withReferences
    ? { images: images.slice(0, 2), references: images.slice(2) } : images)}`, {
    cwd: root, model: { provider: 'fixture-provider', id: 'fixture-model' }, thinkingLevel: 'medium',
    ui: {
      notify: message => { notices.push(message); },
      select: async (_title, options) => {
        events.push('question');
        const answer = selections.shift();
        assert.ok(answer && options.includes(answer));
        return answer;
      },
    },
  });
  assert.equal(selections.length, 0);
  assert.equal(events.indexOf('images'), 1);
  const recordsPath = join(home, 'namespaces/real/records');
  assert.ok(existsSync(recordsPath), notices.join('\n'));
  const records = readdirSync(recordsPath);
  assert.equal(records.length, 1, notices.join('\n'));
  const record = JSON.parse(readFileSync(join(recordsPath, records[0] ?? ''), 'utf8'));
  assert.equal(record.humanResponse.comparisonChoice, 'b');
  assert.equal(record.humanResponse.satisfaction, withReferences ? 'unsatisfied' : 'satisfied');
  assert.equal(record.humanResponse.referencePreference, withReferences ? 'a' : null);
  if (withReferences) {
    assert.equal(readFileSync(record.images.references.a.path).toString('base64'), displayed[2]);
    assert.equal(readFileSync(record.images.references.b.path).toString('base64'), displayed[3]);
    assert.equal(record.humanResponse.interview.answers.find((answer: { questionId: string }) =>
      answer.questionId === 'reference-application-fit').optionIds[0], 'source-only');
  }
  assert.equal(readFileSync(record.images.b.path).toString('base64'), displayed[1]);
  assert.equal(record.modelInterpretation.summary, '');
  assert.deepEqual(record.modelInterpretation.advisory, []);
  assert.equal(record.humanResponse.interview.answers.find((answer: { questionId: string }) =>
    answer.questionId === 'comparison').text, 'B가 더 좋다');
  assert.equal(handoffs.length, 1);
  const handoff = JSON.parse(handoffs[0] ?? '');
  assert.deepEqual(handoff.humanResponse, record.humanResponse);
  assert.equal(handoff.images.b, record.images.b.sha256);
  assert.equal(handoffs[0]?.includes(home), false);
  assert.equal(readdirSync(root).some(name => name === '.omd'), false);
  assert.ok(notices.length > 0);
  const ui = { notify: (message: string) => { notices.push(message); } };
  await command.handler(`export ${record.recordId}`, { cwd: root, ui });
  const editable = JSON.parse(notices.at(-1) ?? '');
  assert.equal(Object.hasOwn(editable, 'recordSha256'), false);
  editable.modelInterpretation = { summary: 'A hypothesis, not a developer quote.', advisory: ['Preserve task context.'] };
  const revised = join(directory, 'revised.json');
  writeFileSync(revised, JSON.stringify(editable));
  await command.handler(`revise ${revised}`, { cwd: root, ui });
  assert.equal(readdirSync(recordsPath).length, 2);
  await command.handler(`revoke ${record.recordId}`, { cwd: root, ui });
  assert.equal(readdirSync(join(home, 'namespaces/real/revocations')).length, 1);
  await command.handler('pin', { cwd: root, ui });
  const snapshots = readdirSync(join(home, 'namespaces/real/snapshots'));
  assert.equal(snapshots.length, 1);
  const snapshot = JSON.parse(readFileSync(join(home, 'namespaces/real/snapshots', snapshots[0] ?? ''), 'utf8'));
  assert.deepEqual(snapshot.cases, []);
});

test('skipped developer consent cannot become an evaluation or approval', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-interview-skip-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let command: PortablePiCommand | undefined;
  registerDeveloperEvaluation({
    registerCommand(_name, value) { command = value; }, registerTool() {},
    async exec() { throw new Error('unexpected execution'); },
    sendMessage() { throw new Error('no image disclosure without consent'); },
  }, captureDesignExecutionPolicy({ OMD_DESIGN_MODE: 'developer-evaluation' }), join(directory, 'private'));
  assert.ok(command);
  await command.handler('compare ["missing-a.png","missing-b.png"]', {
    cwd: directory, ui: { notify() {}, select: async () => undefined },
  });
  await command.handler('compare {"images":["missing-a.png","missing-b.png"],"references":["private-a.png","private-b.png"]}', {
    cwd: directory, ui: { notify() {}, select: async () => undefined },
  });
  assert.deepEqual(readdirSync(directory), []);
});
