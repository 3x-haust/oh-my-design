import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { PNG } from 'pngjs';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { packetDir, put, resultDir, THIN_REFERENCE, ThinError } from './state.ts';

/**
 * The cold eye's packet: captures of the result and captures of the chosen real work, nothing else. No brief, notes,
 * memo or rationale, and neutral file names, so the reader brings no context. A capture much taller than it is wide is
 * cut into consecutive parts, top to bottom, so a reader that shrinks large images still sees it at a legible size.
 */
export const COLD_EYE_QUESTION = [
  'The folder you are given holds two sets of images and nothing else. Under result/ are captures of one piece of work,',
  'at desktop and phone width; a tall page is cut into consecutive parts (01-1, 01-2, ...), top to bottom. Under reference/',
  'are captures of a real finished work, there only as a measure. You know nothing else about either, on purpose.',
  '',
  'Where does the work under result/ give away that a senior designer did not make it?',
  '',
  'Answer with the single largest tell, described by what you see and where (which image, which part). If you find none,',
  'say plainly "No tell." Begin your answer with "Tell:" or "No tell." Do not list fixes, score, or praise.',
].join('\n');

const IMAGE = /\.(?:png|jpe?g|webp)$/i;
/** A part is at most this many times as tall as it is wide: about two desktop screens, or one and a bit phone screens. */
const maxPartRatio = (width: number): number => width >= 800 ? 1.25 : 2.4;

export type Packet = { dir: string; result: string[]; reference: string[] };

const images = (root: string, dir: string): string[] => existsSync(join(root, dir))
  ? readdirSync(join(root, dir)).filter(name => IMAGE.test(name) && !name.startsWith('.')).sort() : [];

function copyCapture(writer: ProjectWriteAdapter, source: string, targetDir: string, index: number): string[] {
  const label = String(index + 1).padStart(2, '0');
  const extension = extname(source).toLowerCase();
  if (extension === '.png') {
    let png: PNG | undefined;
    try { png = PNG.sync.read(readFileSync(source)); } catch { png = undefined; }
    if (png !== undefined) {
      const partHeight = Math.round(png.width * maxPartRatio(png.width));
      if (png.height > partHeight * 1.15) {
        const names: string[] = [];
        for (let top = 0, part = 1; top < png.height; top += partHeight, part += 1) {
          const height = Math.min(partHeight, png.height - top);
          const slice = new PNG({ width: png.width, height });
          PNG.bitblt(png, slice, 0, top, png.width, height, 0, 0);
          const name = `${label}-${part}.png`;
          put(writer, `${targetDir}/${name}`, PNG.sync.write(slice));
          names.push(name);
        }
        return names;
      }
    }
  }
  const name = `${label}${extension === '.jpeg' ? '.jpg' : extension}`;
  put(writer, `${targetDir}/${name}`, readFileSync(source));
  return [name];
}

/** Rebuild the packet for one cycle from its result captures and the chosen reference captures. */
export function assemblePacket(writer: ProjectWriteAdapter, cycle: number): Packet {
  const root = writer.projectRoot;
  const result = images(root, resultDir(cycle));
  if (result.length === 0) {
    throw new ThinError(`no captures in ${resultDir(cycle)}; render the result at desktop and phone width into it first`);
  }
  const reference = images(root, THIN_REFERENCE);
  const dir = packetDir(cycle);
  // Rebuilt from nothing each time, so no stray note or stale capture rides along.
  for (const entry of existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) { writer.remove(`${dir}/${entry.name}`); continue; }
    for (const name of readdirSync(join(root, dir, entry.name))) writer.remove(`${dir}/${entry.name}/${name}`);
    writer.removeEmptyDirectory(`${dir}/${entry.name}`);
  }
  const packet: Packet = { dir, result: [], reference: [] };
  for (const [side, names, from] of [['result', result, resultDir(cycle)], ['reference', reference, THIN_REFERENCE]] as const) {
    writer.mkdir(`${dir}/${side}`);
    names.forEach((name, index) => { packet[side].push(...copyCapture(writer, join(root, from, name), `${dir}/${side}`, index).map(file => `${side}/${file}`)); });
  }
  return packet;
}

/** Every image in a packet folder (assembled here or by hand), result first, as absolute paths. */
export function packetImages(dir: string): string[] {
  return (['result', 'reference'] as const).flatMap(side => existsSync(join(dir, side))
    ? readdirSync(join(dir, side)).filter(name => IMAGE.test(name)).sort().map(name => join(dir, side, name)) : []);
}
