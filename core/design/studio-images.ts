import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { cutAsset, type Split } from './asset-cut.ts';
import { IDEA_DIRECTORY, IDEA_IMAGE_TOOL, ideaImages, MOCKUP_KINDS } from './idea-image.ts';
import { OPEN_IMAGE_LICENCES, stockSource, type ImageRecord } from './studio-floors.ts';
import { STUDIO_IMAGES } from './studio-paths.ts';

/**
 * The only writers of .omd/studio/images.json. A generated candidate ships as the product's own asset once it is cut out
 * here, with the prompt, the tool and the candidate it came from recorded beside each file; any other added image is
 * recorded with its source and an open licence. A generated page or concept board is a draft and never ships.
 */
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function shippedPath(path: string, what: string): string {
  const clean = normalize(path).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (clean === '' || clean.startsWith('..') || clean.startsWith('/')) throw new Error(`STUDIO_IMAGE_PATH: ${what} ${path} is outside the project`);
  if (clean.startsWith('.omd/') || clean === '.omd') throw new Error(`STUDIO_IMAGE_PATH: ${what} ${path} is in the design record; ship into the project (public/, src/assets/)`);
  return clean;
}

function existingRows(root: string): unknown[] {
  if (!existsSync(join(root, STUDIO_IMAGES))) return [];
  try {
    const value: unknown = JSON.parse(readFileSync(join(root, STUDIO_IMAGES), 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { throw new Error(`STUDIO_IMAGES_INVALID: ${STUDIO_IMAGES} is not JSON; it is written only by omd studio asset and omd studio image`); }
}

function writeRows(root: string, writer: ProjectWriteAdapter, rows: readonly ImageRecord[]): void {
  const files = new Set(rows.map(row => row.file));
  const kept = existingRows(root).filter(row => !(typeof row === 'object' && row !== null && files.has(String(Reflect.get(row, 'file')))));
  writer.mkdir(dirname(STUDIO_IMAGES));
  writer.write(STUDIO_IMAGES, `${JSON.stringify([...kept, ...rows], null, 2)}\n`);
}

export type PublishedAsset = Readonly<{ files: readonly string[]; rows: readonly ImageRecord[] }>;

/** Cut a chosen generated candidate out of its background, split a set into its items and ship them with their provenance. */
export function publishAsset(root: string, writer: ProjectWriteAdapter, input: Readonly<{ candidate: string; out: string; cut: boolean; split: Split;
  names?: readonly string[]; tolerance?: number | undefined }>): PublishedAsset {
  const candidate = normalize(input.candidate).replace(/\\/g, '/').replace(/^\.\//, '');
  const idea = ideaImages(root).find(item => item.path === candidate);
  if (idea === undefined) {
    throw new Error(`STUDIO_ASSET_UNKNOWN: ${input.candidate} is not a generated image on record in ${IDEA_DIRECTORY}; make candidates with omd imagegen --kind asset`);
  }
  if (MOCKUP_KINDS.has(idea.kind)) {
    throw new Error(`STUDIO_ASSET_MOCKUP: ${candidate} is a generated ${idea.kind === 'page' ? 'page idea' : 'concept board'}, a draft of the whole surface; `
      + 'it never ships as a picture of the page. Build the screen in HTML, and generate the assets it needs with omd imagegen --kind asset');
  }
  const out = shippedPath(input.out, '--out');
  const items = cutAsset(readFileSync(join(root, candidate)), { cut: input.cut, split: input.split, tolerance: input.tolerance });
  const asDirectory = input.split !== 'none';
  if (!asDirectory && !/\.png$/i.test(out)) throw new Error('STUDIO_IMAGE_PATH: --out names a .png file (or a folder with --split)');
  if (input.names !== undefined && input.names.length !== items.length) {
    throw new Error(`STUDIO_ASSET_NAMES: the sheet holds ${items.length} items and --names gives ${input.names.length}; name each item, in reading order`);
  }
  const base = idea.name;
  const files = items.map((_, index) => asDirectory
    ? `${out}/${(input.names?.[index] ?? `${base}-${index + 1}`).replace(/[^a-z0-9가-힣_-]+/gi, '-')}.png` : out);
  let record: { tool?: unknown } = {};
  try { record = JSON.parse(readFileSync(join(root, candidate.replace(/\.png$/, '.json')), 'utf8')) as { tool?: unknown }; } catch { /* the idea list already read it */ }
  const rows: ImageRecord[] = items.map((bytes, index) => {
    writer.mkdir(dirname(files[index]!));
    writer.write(files[index]!, bytes);
    return { file: files[index]!, source: `omd imagegen ${candidate}`, licence: 'own', sha256: sha256(bytes),
      generated: { tool: typeof record.tool === 'string' ? record.tool : IDEA_IMAGE_TOOL, prompt: idea.prompt, candidate, kind: idea.kind, set: idea.name } };
  });
  writeRows(root, writer, rows);
  return { files, rows };
}

/** Record an added image that was not generated: the project's own, a render of its own code, or an openly licensed file. */
export function recordImage(root: string, writer: ProjectWriteAdapter, input: Readonly<{ file: string; source: string; licence: string }>): ImageRecord {
  const file = shippedPath(input.file, 'the image');
  if (!existsSync(join(root, file))) throw new Error(`STUDIO_IMAGE_PATH: ${file} does not exist`);
  const licence = input.licence.trim().toLowerCase();
  if (!OPEN_IMAGE_LICENCES.has(licence)) {
    throw new Error(`STUDIO_IMAGE_LICENCE: ${input.licence} is not an open licence; an added image ships only as own, rendered, CC0-1.0 or public-domain`);
  }
  const source = input.source.trim();
  if (source.length < 3) throw new Error('STUDIO_IMAGE_SOURCE: --source names where it came from: a URL, "omd render <page>", or own');
  if (stockSource(source)) throw new Error(`STUDIO_IMAGE_SOURCE: ${new URL(source).hostname} licenses on terms of its own that add clauses; draw or generate the image instead`);
  const generated = ideaImages(root).find(idea => { try { return sha256(readFileSync(join(root, idea.path))) === sha256(readFileSync(join(root, file))); } catch { return false; } });
  if (generated !== undefined) {
    throw new Error(`STUDIO_IMAGE_GENERATED: ${file} is the generated ${generated.path}; ${MOCKUP_KINDS.has(generated.kind)
      ? 'a page idea or concept board never ships' : `publish it with omd studio asset ${generated.path} --out ${file}, which records its provenance`}`);
  }
  const row: ImageRecord = { file, source, licence: input.licence.trim(), sha256: sha256(readFileSync(join(root, file))) };
  writeRows(root, writer, [row]);
  return row;
}
