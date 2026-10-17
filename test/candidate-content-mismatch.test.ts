import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { candidateContentProjection, checkCandidatePreview, publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { selectedBaseTokens } from '../core/tokens/minimal.ts';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { fileReceipt, readReceipt } from '../core/brief/candidate-data.ts';
import { measureProject } from '../core/measure/index.ts';
import { parseVisualMeasurement } from '../core/measure/schema.ts';
import { fixture, renderedSet, seed, write, snapshot } from './helpers/phase6-process.ts';

test('candidate content refusal identifies exact missing and extra text without source mutation', { timeout: 120_000 }, async t => {
  const f = fixture(t);
  const set = await renderedSet(f);
  const candidate = set.candidates[0]!;
  const before = readFileSync(join(f.root, candidate.source.path));
  const first = f.content.units[0]!;
  const changed = { ...f.content, units: [
    { ...first, text: 'Required replacement' }, ...f.content.units.slice(1), first, first,
  ] };
  assert.throws(() => checkCandidatePreview(f.root, candidate.previews[0]!, candidate.source,
    f.plan, changed, selectedBaseTokens(seed, f.plan.candidates[0]!.primitiveOverrides)), error => {
    assert.ok(error instanceof Error);
    const diagnostic = JSON.parse(error.message.slice(error.message.indexOf('\n') + 1));
    assert.equal(diagnostic.schema, 'candidate-content-mismatch-v1');
    assert.equal(diagnostic.viewId, 'desktop-1280x900@1');
    assert.equal(diagnostic.expectedCount, 5);
    assert.equal(diagnostic.actualCount, 3);
    assert.equal(diagnostic.missingCount, 2);
    assert.equal(diagnostic.extraCount, 0);
    assert.deepEqual(diagnostic.missing, [
      { text: 'Required replacement', sha256: sha256('Required replacement') },
      { text: first.text, sha256: sha256(first.text) },
    ]);
    return true;
  });
  const replacement = { ...f.content, units: [{ ...first, text: 'Required replacement' },
    ...f.content.units.slice(1)] };
  assert.throws(() => checkCandidatePreview(f.root, candidate.previews[0]!, candidate.source,
    f.plan, replacement, selectedBaseTokens(seed, f.plan.candidates[0]!.primitiveOverrides)), error => {
    assert.ok(error instanceof Error);
    const diagnostic = JSON.parse(error.message.slice(error.message.indexOf('\n') + 1));
    assert.equal(diagnostic.missingCount, 1);
    assert.equal(diagnostic.extraCount, 1);
    assert.deepEqual(diagnostic.extra, [{ text: first.text, sha256: sha256(first.text) }]);
    return true;
  });
  assert.deepEqual(readFileSync(join(f.root, candidate.source.path)), before);
});

test('candidate content owners preserve exact text across inline DOM splits', { timeout: 120_000 }, async t => {
  const variants = [
    { name: 'interleaved exact text', markup: 'Patch <span>the</span> instrument', owner: 'heading', error: null },
    { name: 'missing word', markup: 'Patch instrument', owner: 'heading', error: /content-mismatch/ },
    { name: 'hidden word', markup: 'Patch <span style="display:none">the</span> instrument', owner: 'heading', error: /content-mismatch/ },
    { name: 'extra word', markup: 'Patch <span>the extra</span> instrument', owner: 'heading', error: /content-mismatch/ },
    { name: 'unknown owner', markup: 'Patch <span>the</span> instrument', owner: 'foreign', error: /content owner/ },
    { name: 'nested owner', markup: 'Patch <span data-omd-content-id="body">the</span> instrument', owner: 'heading', error: /content owner/ },
    { name: 'unowned split', markup: 'Patch <span>the</span> instrument', owner: null, error: /content-mismatch/ },
    { name: 'wrong child type', markup: 'Patch <span style="font-weight:700">the</span> instrument', owner: 'heading', error: /type treatment differs/ },
    { name: 'duplicate owner', markup: 'Patch <span>the</span> instrument', owner: 'heading', duplicate: true, error: /content owner/ },
  ];
  for (const variant of variants) await t.test(variant.name, async st => {
    const f = fixture(st);
    publishCandidatePlan(f.root, f.plan, f.writer, f.invocation);
    const path = '.omd/.cache/sketches/A/index.html';
    const heading = `<p${variant.owner === null ? '' : ` data-omd-content-id="${variant.owner}"`}>${variant.markup}</p>`;
    write(f.root, path, `<!doctype html><html><head><title>Content ownership</title><style>body{margin:24px;color:#111;background:#fff;font:400 16px/1.5 system-ui}p{font:inherit;margin:0 0 24px}</style></head><body><main>${heading}${variant.duplicate ? heading : ''}${f.content.units.slice(1).map(unit => `<p data-omd-content-id="${unit.id}">${unit.text}</p>`).join('')}</main></body></html>`);
    const measured = await measureProject({ root: f.root, entry: path, writer: f.writer, invocation: f.invocation });
    const packet = parseVisualMeasurement(JSON.parse(readReceipt(f.root, measured.packet).toString('utf8')));
    const source = fileReceipt(f.root, path), before = snapshot(f.root);
    const checks: (() => string)[] = [];
    for (const capture of packet.captures) {
      const scope = packet.scope.find(view => view.id === capture.viewId);
      assert.ok(scope);
      const preview = { renderId: `${measured.packet.sha256}:${capture.viewId}`,
        sourceSha256: source.sha256, surfaceId: 'main', stateId: 'initial',
        viewId: capture.viewId, viewport: scope.viewport, png: capture.capture, capture: measured.packet };
      const check = () => checkCandidatePreview(f.root, preview, source, f.plan,
        f.content, selectedBaseTokens(seed, f.plan.candidates[0]!.primitiveOverrides));
      checks.push(check);
      if (variant.error === null) assert.doesNotThrow(check);
      else assert.throws(check, variant.error);
    }
    assert.deepEqual(snapshot(f.root), before);
    if (variant.error === null) {
      write(f.root, path, readFileSync(join(f.root, path), 'utf8') + '\n');
      const afterEdit = snapshot(f.root);
      for (const check of checks) assert.throws(check, /preview source\/state\/view\/render binding/);
      assert.deepEqual(snapshot(f.root), afterEdit);
    }
  });
});

test('native option content reports unavailable glyph evidence without inventing painted text', { timeout: 120_000 }, async t => {
  const variants = [
    { name: 'painted radio labels', native: false, attributes: '', css: '', error: null },
    { name: 'visible native listbox', native: true, attributes: 'size="4"', css: '', error: /candidate-content-unmeasurable-v1/ },
    { name: 'collapsed native select', native: true, attributes: '', css: '', error: /candidate-content/ },
    { name: 'hidden native listbox', native: true, attributes: 'size="4" style="display:none"', css: '', error: /content-mismatch/ },
    { name: 'wrong label leading', native: false, attributes: '', css: 'label{line-height:2}', error: /type treatment differs/ },
    { name: 'wrong label weight', native: false, attributes: '', css: 'label{font-weight:700}', error: /type treatment differs/ },
  ];
  for (const variant of variants) await t.test(variant.name, async st => {
    const f = fixture(st);
    publishCandidatePlan(f.root, f.plan, f.writer, f.invocation);
    const path = '.omd/.cache/sketches/A/index.html';
    const labels = f.content.units.map(unit => variant.native
      ? `<option data-omd-content-id="${unit.id}">${unit.text}</option>`
      : `<label data-omd-content-id="${unit.id}"><input type="radio" name="choice">${unit.text}</label>`).join('');
    write(f.root, path, `<!doctype html><html><head><title>Measured choices</title><style>body{margin:24px;color:#111;background:#fff;font:400 16px/1.5 system-ui}select,option,label{font:inherit}label{display:block;margin-bottom:24px}${variant.css}</style></head><body><main>${variant.native ? `<select ${variant.attributes}>${labels}</select>` : labels}</main></body></html>`);
    const measured = await measureProject({ root: f.root, entry: path, writer: f.writer, invocation: f.invocation });
    const packet = parseVisualMeasurement(JSON.parse(readReceipt(f.root, measured.packet).toString('utf8')));
    const source = fileReceipt(f.root, path), before = snapshot(f.root);
    for (const capture of packet.captures) {
      const scope = packet.scope.find(view => view.id === capture.viewId)!;
      const preview = { renderId: `${measured.packet.sha256}:${capture.viewId}`, sourceSha256: source.sha256,
        surfaceId: 'main', stateId: 'initial', viewId: capture.viewId, viewport: scope.viewport,
        png: capture.capture, capture: measured.packet };
      const check = () => checkCandidatePreview(f.root, preview, source, f.plan,
        f.content, selectedBaseTokens(seed, f.plan.candidates[0]!.primitiveOverrides));
      if (variant.error === null) assert.doesNotThrow(check);
      else assert.throws(check, variant.error);
      if (variant.name === 'visible native listbox') {
        assert.throws(check, error => {
          assert.ok(error instanceof Error);
          const diagnostic = JSON.parse(error.message.slice(error.message.indexOf('\n') + 1));
          assert.equal(diagnostic.reason, 'native-option-glyphs-unavailable');
          assert.equal(diagnostic.subjects.length, f.content.units.length);
          assert.deepEqual(diagnostic.subjects.map((subject: { contentId: string }) => subject.contentId), f.content.units.map(unit => unit.id));
          assert.ok(diagnostic.subjects.every((subject: { graphemes: number; lines: number }) => subject.graphemes === 0 && subject.lines === 0));
          return true;
        });
        assert.throws(() => checkCandidatePreview(f.root, { ...preview, png: { ...preview.png, sha256: 'f'.repeat(64) } },
          source, f.plan, f.content, selectedBaseTokens(seed, {})), /binding differs/);
      }
    }
    assert.deepEqual(snapshot(f.root), before);
    if (variant.name === 'visible native listbox') {
      write(f.root, path, readFileSync(join(f.root, path), 'utf8') + '\n');
      const capture = packet.captures[0]!, scope = packet.scope[0]!;
      assert.throws(() => checkCandidatePreview(f.root, { renderId: `${measured.packet.sha256}:${capture.viewId}`,
        sourceSha256: source.sha256, surfaceId: 'main', stateId: 'initial', viewId: capture.viewId,
        viewport: scope.viewport, png: capture.capture, capture: measured.packet },
      source, f.plan, f.content, selectedBaseTokens(seed, {})), /binding differs/);
    }
  });
});

test('a closed DOM-painted choice preserves visible units and unopened shared options', { timeout: 120_000 }, async t => {
  const f = fixture(t);
  const options = ['All sources', 'Oscillator', 'Filter'];
  const content = { ...f.content,
    units: [{ ...f.content.units[0]!, text: options[0]! }, ...f.content.units.slice(1)],
    facts: [...f.content.facts, JSON.stringify({ options })] };
  const contentPath = '.omd/.cache/sketches/content.json';
  write(f.root, contentPath, JSON.stringify(content));
  const plan = { ...f.plan, content: { ...f.plan.content, receipt: fileReceipt(f.root, contentPath),
    projectionSha256: candidateContentProjection(f.root, content), contentIds: content.units.map(unit => unit.id) } };
  publishCandidatePlan(f.root, plan, f.writer, f.invocation);
  const path = '.omd/.cache/sketches/A/index.html';
  write(f.root, path, `<!doctype html><html><head><title>Closed choice</title><style>body{margin:24px;font:400 16px/1.5 system-ui;color:#111;background:white}button,p{font:inherit}p{margin:24px 0}</style></head><body><button type="button" aria-haspopup="listbox" aria-expanded="false" data-omd-content-id="${content.units[0]!.id}" onclick="document.getElementById('choices').hidden=false;this.setAttribute('aria-expanded','true')">${options[0]}</button><div id="choices" role="listbox" hidden>${options.map(option => `<button type="button" role="option">${option}</button>`).join('')}</div>${content.units.slice(1).map(unit => `<p data-omd-content-id="${unit.id}">${unit.text}</p>`).join('')}</body></html>`);
  const measured = await measureProject({ root: f.root, entry: path, writer: f.writer, invocation: f.invocation });
  const packet = parseVisualMeasurement(JSON.parse(readReceipt(f.root, measured.packet).toString('utf8')));
  const source = fileReceipt(f.root, path), before = snapshot(f.root);
  for (const capture of packet.captures) {
    const scope = packet.scope.find(view => view.id === capture.viewId)!;
    assert.doesNotThrow(() => checkCandidatePreview(f.root, {
      renderId: `${measured.packet.sha256}:${capture.viewId}`, sourceSha256: source.sha256,
      surfaceId: 'main', stateId: 'initial', viewId: capture.viewId, viewport: scope.viewport,
      png: capture.capture, capture: measured.packet,
    }, source, plan, content, selectedBaseTokens(seed, {})));
  }
  assert.deepEqual(snapshot(f.root), before);
});
