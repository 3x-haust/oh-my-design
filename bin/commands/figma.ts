import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs, projectWriterFromActivation, type Opts } from '../cli/runtime.ts';

async function cmdFigmaPull(url: string | undefined, opts: Opts): Promise<never> {
  if (!url) {
    console.error('usage: omd figma pull <file-url>');
    process.exit(1);
  }

  const token = process.env['FIGMA_TOKEN'];
  if (!token) {
    console.error('FIGMA_TOKEN environment variable is not set.\nSet it to a Figma personal access token to use figma pull.');
    process.exit(1);
  }

  const { parseFileKey, fetchAndNormalize } = await import('../../core/figma/client.ts');

  let fileKey: string;
  try {
    fileKey = parseFileKey(url);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  console.log(`Fetching Figma file ${fileKey} …`);
  const snapshot = await fetchAndNormalize(fileKey, token);

  const outDir = join(process.cwd(), '.omd', 'figma');
  const snapPath = join(outDir, 'snapshot.json');
  projectWriterFromActivation(opts, 'omd figma pull').write(relative(process.cwd(), snapPath), JSON.stringify(snapshot, null, 2));

  // Human-readable inventory
  const totalFrames = snapshot.pages.reduce((n, p) => n + p.frames.length, 0);
  const setCount = Object.keys(snapshot.componentSets).length;
  console.log(`\nFile: ${snapshot.fileName}`);
  for (const page of snapshot.pages) {
    console.log(`  Page "${page.name}" — ${page.frames.length} frame${page.frames.length === 1 ? '' : 's'}`);
    for (const frame of page.frames) {
      console.log(`    • ${frame.name}`);
    }
  }
  console.log(`\nTotal frames: ${totalFrames}  Component sets: ${setCount}`);
  if (setCount > 0) {
    for (const cs of Object.values(snapshot.componentSets)) {
      const keys = new Set<string>();
      for (const v of cs.variants) {
        const { parseVariantName } = await import('../../core/figma/system.ts');
        for (const k of Object.keys(parseVariantName(v.name))) keys.add(k);
      }
      const desc = keys.size > 0 ? ` (${[...keys].join('×')})` : '';
      console.log(`  • ${cs.name} — ${cs.variants.length} variant${cs.variants.length === 1 ? '' : 's'}${desc}`);
    }
  }
  console.log(`\nSnapshot saved: ${snapPath}`);
  process.exit(0);
}

async function cmdFigmaSystem(opts: Opts): Promise<never> {
  const snapPath = join(process.cwd(), '.omd', 'figma', 'snapshot.json');
  if (!existsSync(snapPath)) {
    console.error(`No snapshot found at ${snapPath}\nRun \`omd figma pull <file-url>\` first.`);
    process.exit(1);
  }

  const { buildComponentMatrix, extractTokens, generateCss, generateMarkdown } = await import('../../core/figma/system.ts');
  const snapshot = JSON.parse(readFileSync(snapPath, 'utf8')) as import('../../core/figma/types.ts').FigmaSnapshot;

  const tokens = extractTokens(snapshot);
  const matrix = buildComponentMatrix(snapshot);
  const css = generateCss(tokens);
  const md = generateMarkdown(tokens, matrix, snapshot.fileName);

  const outDir = join(process.cwd(), '.omd', 'figma');
  const cssPath = join(outDir, 'tokens.css');
  const mdPath = join(outDir, 'design-system.md');
  const adapter = projectWriterFromActivation(opts, 'omd figma system');
  adapter.write('.omd/figma/tokens.css', css);
  adapter.write('.omd/figma/design-system.md', md);

  console.log(`Design system synthesized from: ${snapshot.fileName}`);
  console.log(`  Colors:     ${tokens.colors.length}`);
  console.log(`  Type scale: ${tokens.typeScale.length} steps`);
  console.log(`  Spacing:    ${tokens.spacing.length} values`);
  console.log(`  Radii:      ${tokens.radii.length} values`);
  console.log(`  Shadows:    ${tokens.shadows.length} values`);
  console.log(`  Components: ${matrix.length} set${matrix.length === 1 ? '' : 's'}`);
  console.log(`\n  ${cssPath}`);
  console.log(`  ${mdPath}`);
  process.exit(0);
}

async function cmdFigmaDiff(opts: Opts): Promise<never> {
  const frameId = opts._[0];
  const pageOrUrl = opts._[1];

  if (!frameId || !pageOrUrl) {
    console.error(
      'usage: omd figma diff <frame-id> <page-or-url> [--threshold 0.97] [--fresh] [--json]',
    );
    process.exit(1);
  }
  const adapter = projectWriterFromActivation(opts, 'omd figma diff');
  const { authorizeFigmaArtifact, createFigmaArtifactAuthoritySession } = await import('../../core/figma/artifact-authority.ts');
  const artifactAuthority = createFigmaArtifactAuthoritySession(process.cwd(), adapter);

  const threshold =
    opts.threshold !== undefined ? parseFloat(opts.threshold) : 0.97;
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    console.error('--threshold must be a number between 0 and 1');
    process.exit(1);
  }

  const fresh = opts.fresh === true;
  const jsonOut = opts.json === true;

  // Load snapshot — frame dimensions and file key live here.
  const snapPath = join(process.cwd(), '.omd', 'figma', 'snapshot.json');
  if (!existsSync(snapPath)) {
    console.error(
      `No snapshot found at ${snapPath}\nRun \`omd figma pull <file-url>\` first.`,
    );
    process.exit(1);
  }

  const snapshotBytes = readFileSync(snapPath);
  const snapshot = JSON.parse(
    snapshotBytes.toString('utf8'),
  ) as import('../../core/figma/types.ts').FigmaSnapshot;

  // Locate frame in snapshot.
  let foundFrame: import('../../core/figma/types.ts').SnapshotFrame | undefined;
  for (const page of snapshot.pages) {
    const f = page.frames.find((fr) => fr.id === frameId);
    if (f !== undefined) { foundFrame = f; break; }
  }

  if (foundFrame === undefined) {
    console.error(`Frame ID "${frameId}" not found in snapshot.\nKnown frames:`);
    for (const page of snapshot.pages) {
      for (const fr of page.frames) {
        console.error(`  ${fr.id}  ${fr.name}`);
      }
    }
    process.exit(1);
  }

  // Frame dimensions come from the root node's absoluteBoundingBox.
  // collectNodes() always puts the frame node first (index 0).
  const rootNode = foundFrame.nodes[0];
  if (rootNode?.absoluteBoundingBox === undefined) {
    console.error(
      `Frame "${foundFrame.name}" (${frameId}) has no absoluteBoundingBox in snapshot.\n`
      + 'Re-run `omd figma pull` to refresh the snapshot.',
    );
    process.exit(1);
  }

  const { width: frameW, height: frameH } = rootNode.absoluteBoundingBox;

  // ── Step 1: reference PNG (cache or live export) ──────────────────────────

  const safeId = frameId.replace(/[:/]/g, '_');
  const exportsDir = join(process.cwd(), '.omd', 'figma', 'exports');
  const cachePath = join(exportsDir, `${safeId}.png`);
  const { figmaArtifactMatchesReceipt, figmaArtifactReceipt } = await import('../../core/figma/artifact-lifecycle.ts');
  const currentExport = figmaArtifactMatchesReceipt(cachePath, 'export', snapshotBytes);

  if (!fresh && currentExport) {
    if (!jsonOut) console.log(`Using cached export: ${cachePath}`);
  } else {
    if (existsSync(cachePath)) {
      console.error(`Refusing to replace an existing Figma deliverable without current-task write authority: ${cachePath}`);
      process.exit(1);
    }
    const token = process.env['FIGMA_TOKEN'];
    if (token === undefined || token.length === 0) {
      console.error(
        'FIGMA_TOKEN environment variable is not set.\n'
        + 'Set it to a Figma personal access token to export frames.',
      );
      process.exit(1);
    }

    if (!jsonOut) console.log(`Exporting frame ${frameId} from Figma …`);

    const imgRes = await fetch(
      `https://api.figma.com/v1/images/${snapshot.fileKey}`
      + `?ids=${encodeURIComponent(frameId)}&format=png&scale=1`,
      { headers: { 'X-Figma-Token': token } },
    );
    if (!imgRes.ok) {
      const body = await imgRes.text().catch(() => '');
      console.error(`Figma image export failed (${imgRes.status}): ${body.slice(0, 300)}`);
      process.exit(1);
    }

    const imgData = (await imgRes.json()) as {
      err?: string;
      images?: Record<string, string | null>;
    };
    if (imgData.err !== undefined && imgData.err !== null) {
      console.error(`Figma image export error: ${imgData.err}`);
      process.exit(1);
    }

    const tempUrl = imgData.images?.[frameId];
    if (tempUrl === undefined || tempUrl === null) {
      console.error(`No image URL returned for frame ${frameId}`);
      process.exit(1);
    }

    const pngRes = await fetch(tempUrl);
    if (!pngRes.ok) {
      console.error(`Failed to download PNG (${pngRes.status}): ${tempUrl}`);
      process.exit(1);
    }

    const pngBytes = Buffer.from(await pngRes.arrayBuffer());
    adapter.write(relative(process.cwd(), cachePath), pngBytes);
    adapter.write(relative(process.cwd(), `${cachePath}.omd.json`), figmaArtifactReceipt({
      kind: 'export', frameId, snapshotBytes, pngBytes,
    }));
    authorizeFigmaArtifact(artifactAuthority, { kind: 'export', frameId, pngPath: cachePath, snapshotBytes });
    if (!jsonOut) console.log(`Exported: ${cachePath}`);
  }

  // ── Step 2: render build at exact frame dimensions ────────────────────────

  if (!jsonOut) {
    console.log(`Rendering ${pageOrUrl} at ${Math.round(frameW)}×${Math.round(frameH)} …`);
  }

  const { renderPage } = await import('../../core/render/index.ts');
  const rendersDir = join(process.cwd(), '.omd', 'figma', 'renders');
  adapter.mkdir(relative(process.cwd(), rendersDir));
  const renderPath = join(rendersDir, `${safeId}.png`);
  if (existsSync(renderPath)) {
    console.error(`Refusing to replace an existing Figma deliverable without current-task write authority: ${renderPath}`);
    process.exit(1);
  }

  await renderPage(pageOrUrl, {
    viewport: { width: Math.round(frameW), height: Math.round(frameH) },
    out: renderPath,
    adapter,
  });
  const buildBuf = readFileSync(renderPath);
  adapter.write(relative(process.cwd(), `${renderPath}.omd.json`), figmaArtifactReceipt({
    kind: 'render', frameId, snapshotBytes, pngBytes: buildBuf,
  }));
  authorizeFigmaArtifact(artifactAuthority, { kind: 'render', frameId, pngPath: renderPath, snapshotBytes });

  // ── Step 3: pixel diff ────────────────────────────────────────────────────

  const { compareImages, formatDiffReport } = await import('../../core/figma/diff.ts');
  const refBuf = readFileSync(cachePath);

  const result = compareImages(refBuf, buildBuf, threshold);

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + formatDiffReport(result));
  }

  process.exit(result.pass ? 0 : 1);
}

async function cmdTargetSet(opts: Opts): Promise<never> {
  const source = opts._[0];
  if (!source || !opts.as) {
    console.error('usage: omd target set <image-path-or-url> --as <name>');
    process.exit(1);
  }

  let buf: Buffer;
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      console.error(`failed to download target image (${res.status}): ${source}`);
      process.exit(1);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    const absPath = resolve(source);
    if (!existsSync(absPath)) {
      console.error(`file not found: ${source}`);
      process.exit(1);
    }
    buf = readFileSync(absPath);
  }

  const { registerTarget } = await import('../../core/target/index.ts');
  const entry = registerTarget(process.cwd(), opts.as, source, buf, projectWriterFromActivation(opts, 'omd target set'));

  console.log(
    `target "${entry.name}" registered  ${entry.viewport.width}×${entry.viewport.height}  ${entry.path}`,
  );
  process.exit(0);
}

async function cmdTargetDiff(opts: Opts): Promise<never> {
  const page = opts._[0];
  if (!page) {
    console.error('usage: omd target diff <page> [--target <name>] [--viewport WxH] [--threshold N] [--json]');
    process.exit(1);
  }

  const threshold =
    opts.threshold !== undefined ? parseFloat(opts.threshold) : 0.97;
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    console.error('--threshold must be a number between 0 and 1');
    process.exit(1);
  }

  const jsonOut = opts.json === true;

  const { listTargets, findTarget, compareAgainstTarget, formatDiffReport } = await import('../../core/target/index.ts');
  const { renderPage, parseViewport } = await import('../../core/render/index.ts');

  // Resolve target entry
  let entry;
  if (opts.target) {
    entry = findTarget(process.cwd(), opts.target);
    if (!entry) {
      console.error(`target "${opts.target}" not found. Run \`omd target list\` to see registered targets.`);
      process.exit(1);
    }
  } else {
    const all = listTargets(process.cwd());
    if (all.length === 0) {
      console.error('no targets registered. Run `omd target set <image> --as <name>` first.');
      process.exit(1);
    }
    entry = all[0]!;
    if (!jsonOut) console.log(`using target "${entry.name}" (first registered)`);
  }

  // Render viewport: --viewport flag overrides the target's stored dimensions
  const viewport = opts.viewport
    ? parseViewport(opts.viewport)
    : { width: entry.viewport.width, height: entry.viewport.height };

  // Render the build
  const rendersDir = join(process.cwd(), '.omd', 'target', '.renders');
  const adapter = projectWriterFromActivation(opts, 'omd target diff');
  adapter.mkdir(relative(process.cwd(), rendersDir));
  const safeTarget = entry.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const renderPath = join(rendersDir, `${safeTarget}.png`);

  if (!jsonOut) {
    console.log(`rendering ${page} at ${viewport.width}×${viewport.height} …`);
  }
  await renderPage(page, { viewport, out: renderPath, adapter });

  // Compare
  const targetBuf = readFileSync(entry.path);
  const buildBuf = readFileSync(renderPath);
  const result = compareAgainstTarget(targetBuf, buildBuf, threshold);

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + formatDiffReport(result));
  }

  process.exit(result.pass ? 0 : 1);
}

async function cmdTargetList(): Promise<never> {
  const { listTargets } = await import('../../core/target/index.ts');
  const targets = listTargets(process.cwd());
  if (targets.length === 0) {
    console.log('No targets registered. Run `omd target set <image> --as <name>`.');
    process.exit(0);
  }
  for (const t of targets) {
    console.log(
      `${t.name}  ${t.viewport.width}×${t.viewport.height}  source: ${t.source}  registered: ${t.registeredAt.slice(0, 10)}`,
    );
  }
  process.exit(0);
}

function unknown(command: string, sub?: string): never {
  throw new Error(`unknown command ${command}${sub ? ` ${sub}` : ''}; run omd help`);
}

export async function runFigma(args: string[]): Promise<never> {
  const command = args[0]!;
  const sub = args[1];
  const opts = parseArgs(args.slice(2));
  if (command === 'figma') {
    if (sub === 'pull') return cmdFigmaPull(args[2], parseArgs(args.slice(3)));
    if (sub === 'system') return cmdFigmaSystem(opts);
    if (sub === 'diff') return cmdFigmaDiff(opts);
    return unknown(command, sub);
  }
  if (command === 'target') {
    if (sub === 'set') return cmdTargetSet(opts);
    if (sub === 'list') return cmdTargetList();
    if (sub === 'diff') return cmdTargetDiff(opts);
    return unknown(command, sub);
  }
  return unknown(command, sub);
}

