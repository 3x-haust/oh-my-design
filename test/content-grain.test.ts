import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
  });

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-content-grain-'));

const writeProjectFile = (root: string, relativePath: string, value: string): void => {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, value);
};

const activeGrain = (sourceSha256: string) => ({
  schema: 'content-grain-v1',
  status: 'active',
  sources: [
    {
      id: 'catalog',
      authority: 'project-first-party',
      path: 'content/catalog.json',
      sha256: sourceSha256,
    },
  ],
  fixtures: [
    {
      id: 'typical-description',
      sourceId: 'catalog',
      locator: '$.services[1].description',
      role: 'typical',
    },
    {
      id: 'long-description',
      sourceId: 'catalog',
      locator: '$.services[2].description',
      role: 'maximum',
    },
  ],
  traits: [
    {
      id: 'description-length',
      sourceIds: ['catalog'],
      fixtureIds: ['typical-description', 'long-description'],
      metric: {
        kind: 'range',
        unit: 'graphemes',
        minimum: 12,
        typical: 48,
        maximum: 164,
      },
      semanticRole: 'primary-proof',
      antiTemplateConsequence: 'Do not force every service into equal-height cards.',
      responsiveConsequence: 'Keep the long proof adjacent to its service action.',
      falsifier: 'The long description clips or becomes less prominent than supporting copy.',
    },
  ],
});

test('publishes source-bound active grain', (context) => {
  const root = project();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = JSON.stringify({
    services: [
      { description: '짧은 설명' },
      { description: '일반적인 서비스 설명은 고객이 다음 행동을 이해하도록 돕습니다.' },
      { description: '긴 설명은 서비스 범위와 예외 조건을 충분히 전달하며 잘리지 않고 유지되어야 합니다.' },
    ],
  });
  writeProjectFile(root, 'content/catalog.json', catalog);
  writeProjectFile(
    root,
    '.omd/content-grain.json',
    `${JSON.stringify(activeGrain(sha256(catalog)), null, 2)}\n`,
  );

  const result = run(['grain', 'check', '--json'], root);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as {
    schema: string;
    status: string;
    grainSha256: string;
    traitIds: string[];
    fixtureIds: string[];
  };
  assert.equal(parsed.schema, 'content-grain-check-v1');
  assert.equal(parsed.status, 'active');
  assert.match(parsed.grainSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(parsed.traitIds, ['description-length']);
  assert.deepEqual(parsed.fixtureIds, ['long-description', 'typical-description']);
});

test('rejects changed source bytes', (context) => {
  const root = project();
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const original = '{"services":[{"description":"원본"}]}';
  writeProjectFile(root, 'content/catalog.json', original);
  writeProjectFile(
    root,
    '.omd/content-grain.json',
    `${JSON.stringify(activeGrain(sha256(original)), null, 2)}\n`,
  );
  writeProjectFile(root, 'content/catalog.json', '{"services":[{"description":"변경됨"}]}');

  const result = run(['grain', 'check', '--json'], root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STALE_CONTENT_GRAIN_SOURCE/);
});

test('rejects unknown and hostile grain fields', async () => {
  const { parseContentGrain } = await import('../core/content-grain/contract.ts');
  const valid = activeGrain('a'.repeat(64));

  assert.throws(
    () => parseContentGrain({ ...valid, surprise: true }),
    /CONTENT_GRAIN_INVALID.*unknown/i,
  );

  const hostile = Object.create(null) as Record<string, unknown>;
  Object.assign(hostile, valid);
  Object.defineProperty(hostile, 'traits', {
    enumerable: true,
    get() {
      throw new Error('hostile getter executed');
    },
  });
  assert.throws(
    () => parseContentGrain(hostile),
    /CONTENT_GRAIN_INVALID.*plain object/i,
  );
});

