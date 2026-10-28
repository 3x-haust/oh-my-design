import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateIdeaImage } from '../core/design/idea-image.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

function project(t: test.TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-idea-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invocation = createTestProjectRunInvocation(root);
  return { root, writer: createTestProjectWriteAdapter(root, invocation) };
}

test('an idea image lands in the design record with its prompt, numbered per section', t => {
  const { root, writer } = project(t);
  writeFileSync(join(root, 'kept.png'), 'reference');
  const seen: { instruction: string; references: readonly string[] }[] = [];
  const run = (directory: string, instruction: string, references: readonly string[]) => {
    seen.push({ instruction, references }); writeFileSync(join(directory, 'idea.png'), `image ${seen.length}`);
  };
  const prompt = 'The OMD mark as a glossy orange object lifting a page out of a grey template, warm key light, white ground';
  const first = generateIdeaImage(root, writer, { name: 'Hero', prompt, references: ['kept.png'] }, run);
  const second = generateIdeaImage(root, writer, { name: 'Hero', prompt }, run);
  assert.deepEqual([first.path, second.path], ['.omd/ideas/hero-1.png', '.omd/ideas/hero-2.png']);
  assert.equal(readFileSync(join(root, first.path), 'utf8'), 'image 1');
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.omd/ideas/hero-1.json'), 'utf8')).references, ['kept.png']);
  assert.match(seen[0]!.instruction, /will not ship[\s\S]*kept references[\s\S]*Idea: The OMD mark/);
  assert.equal(seen[0]!.references[0], join(root, 'kept.png'));
  // Inside a sandboxed host the model cannot copy the image; the runner hands back where Codex stored it.
  const stored = join(root, 'stored.png');
  writeFileSync(stored, 'stored image');
  const third = generateIdeaImage(root, writer, { name: 'Hero', prompt }, () => stored);
  assert.equal(readFileSync(join(root, third.path), 'utf8'), 'stored image');
});

test('a thin prompt or a missing reference writes nothing; a failed generation is recorded as unavailable', async t => {
  const { root, writer } = project(t);
  assert.throws(() => generateIdeaImage(root, writer, { name: 'hero', prompt: 'a nice graphic' }, () => undefined), /IDEA_IMAGE_PROMPT/);
  const prompt = 'A long enough idea prompt that names the object, its material and the light';
  assert.throws(() => generateIdeaImage(root, writer, { name: 'hero', prompt, references: ['missing.png'] }, () => undefined), /IDEA_IMAGE_REFERENCE/);
  assert.equal(existsSync(join(root, '.omd/ideas')), false, 'refused inputs write nothing');
  assert.throws(() => generateIdeaImage(root, writer, { name: 'hero', prompt }, () => undefined), /IDEA_IMAGE_UNAVAILABLE/);
  // A failed generation is recorded so the maker may sketch in code instead, but no image is invented.
  assert.equal(existsSync(join(root, '.omd/ideas/unavailable.json')), true);
  assert.equal(existsSync(join(root, '.omd/ideas/hero-1.png')), false);
  const { ideationRecorded } = await import('../core/design/idea-image.ts');
  assert.equal(ideationRecorded(root), true);
});

test('a page idea drafts a section flat at desktop width from words, and is told apart from a graphic idea', async t => {
  const { root, writer } = project(t);
  const { ideaImages, ideationRecorded } = await import('../core/design/idea-image.ts');
  const seen: string[] = [];
  const run = (directory: string, instruction: string) => { seen.push(instruction); writeFileSync(join(directory, 'idea.png'), 'draft'); };
  const prompt = 'Hero: "AI that designs like a human." left, 72px grotesk; the real rendered bakery page large on the right; one orange action';
  writeFileSync(join(root, 'kept.png'), 'reference');
  // Gallery pixels pull a draft into someone else's layout; the references are described in the prompt instead.
  assert.throws(() => generateIdeaImage(root, writer, { name: 'hero', prompt, kind: 'page', references: ['kept.png'] }, run), /IDEA_IMAGE_REFERENCE: a page idea/);
  generateIdeaImage(root, writer, { name: 'review', prompt: 'A page lifted out of a stack of grey templates, ivory paper, warm key light' }, run);
  assert.equal(ideationRecorded(root, 'page'), false, 'a graphic idea settles one object, not the page around it');
  const page = generateIdeaImage(root, writer, { name: 'hero', prompt, kind: 'page' }, run);
  assert.match(seen.at(-1)!, /landing-page section seen flat at desktop width, a wide landscape frame[\s\S]*Draw one composition only[\s\S]*Set the given copy exactly[\s\S]*Section: Hero:/);
  assert.doesNotMatch(seen.at(-1)!, /No text, captions/);
  assert.equal(JSON.parse(readFileSync(join(root, '.omd/ideas/hero-1.json'), 'utf8')).kind, 'page');
  assert.equal(ideationRecorded(root, 'page'), true);
  assert.deepEqual(ideaImages(root).map(idea => [idea.path, idea.kind]), [[page.path, 'page'], ['.omd/ideas/review-1.png', 'graphic']]);
});

test('a page idea travels to review as a deterministic narrower copy; a narrow one is sent as is', async () => {
  const { PNG } = await import('pngjs');
  const { pageIdeaPreview, PAGE_IDEA_PREVIEW_WIDTH } = await import('../core/design/idea-image.ts');
  const wide = new PNG({ width: 1800, height: 900 });
  for (let i = 0; i < wide.data.length; i += 4) { wide.data[i] = (i / 4) % 256; wide.data[i + 1] = 80; wide.data[i + 2] = 160; wide.data[i + 3] = 255; }
  const bytes = PNG.sync.write(wide), preview = pageIdeaPreview(bytes), decoded = PNG.sync.read(preview);
  assert.deepEqual([decoded.width, decoded.height], [PAGE_IDEA_PREVIEW_WIDTH, 512]);
  assert.ok(preview.length < bytes.length);
  assert.ok(pageIdeaPreview(bytes).equals(preview), 'the same source always yields the same preview');
  const narrow = PNG.sync.write(new PNG({ width: 800, height: 400 }));
  assert.ok(pageIdeaPreview(narrow).equals(narrow));
});
