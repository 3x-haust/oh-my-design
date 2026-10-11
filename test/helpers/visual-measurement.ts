import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './project-write.ts';
export function measurementFixture(kind: 'clean' | 'test-016') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-measure-fixture-'))), fixtures = fileURLToPath(new URL('../fixtures/visual-measurement/', import.meta.url));
  mkdirSync(join(root, '.omd')); mkdirSync(join(root, 'dist')); mkdirSync(join(root, 'src'));
  cpSync(join(fixtures, 'assets'), join(root, 'dist/assets'), { recursive: true });
  const html = readFileSync(join(fixtures, kind === 'clean' ? 'clean-product.html' : 'test-016-like.html'));
  writeFileSync(join(root, 'dist/index.html'), html); writeFileSync(join(root, 'src/index.html'), html);
  for (const name of ['type-proof', 'composition']) writeFileSync(join(root, `.omd/${name}.md`), readFileSync(join(fixtures, `${kind}-${name}.md`)));
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  return { root, invocation, writer, html };
}
