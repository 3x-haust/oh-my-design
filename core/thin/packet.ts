import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { parse } from 'yaml';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { comparePath, packetDir, put, resultDir, THIN_REFERENCE, ThinError } from './state.ts';

/**
 * The cold eye's packet: captures of the result, from cycle 2 on the captures of the standing earlier result under
 * other/ (a name that does not say which is newer), and captures of the chosen real work, nothing else. No brief, notes,
 * memo or rationale, and neutral file names, so the reader brings no context. Which cycle other/ holds is recorded
 * outside the packet. A capture much taller than it is wide is
 * cut into consecutive parts, top to bottom, so a reader that shrinks large images still sees it at a legible size.
 *
 * The cold eye's question has one source: the omd-internal-cold-eye agent's instructions. The Pi eye and
 * omd thin eye --prompt use these same words.
 */
export const COLD_EYE_SOURCE = join(dirname(fileURLToPath(import.meta.url)), '../../src/agents/internal-cold-eye.agent.yaml');
export const COLD_EYE_QUESTION: string = (parse(readFileSync(COLD_EYE_SOURCE, 'utf8')) as { instructions: string }).instructions.trim();

const IMAGE = /\.(?:png|jpe?g|webp)$/i;
/** A part is at most this many times as tall as it is wide: about two desktop screens, or one and a bit phone screens. */
const maxPartRatio = (width: number): number => width >= 800 ? 1.25 : 2.4;

export type Packet = { dir: string; result: string[]; other: string[]; reference: string[] };
const SIDES = ['result', 'other', 'reference'] as const;

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

/** Rebuild the packet for one cycle from its result captures, the earlier result it is compared with, and the reference captures. */
export function assemblePacket(writer: ProjectWriteAdapter, cycle: number, against: number | null = null): Packet {
  const root = writer.projectRoot;
  const result = images(root, resultDir(cycle));
  if (result.length === 0) {
    throw new ThinError(`no captures in ${resultDir(cycle)}; render the result at desktop and phone width into it first`);
  }
  const reference = images(root, THIN_REFERENCE);
  const other = against === null ? [] : images(root, resultDir(against));
  const dir = packetDir(cycle);
  // Rebuilt from nothing each time, so no stray note or stale capture rides along.
  for (const entry of existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) { writer.remove(`${dir}/${entry.name}`); continue; }
    for (const name of readdirSync(join(root, dir, entry.name))) writer.remove(`${dir}/${entry.name}/${name}`);
    writer.removeEmptyDirectory(`${dir}/${entry.name}`);
  }
  const packet: Packet = { dir, result: [], other: [], reference: [] };
  const sources = [['result', result, resultDir(cycle)], ['other', other, against === null ? '' : resultDir(against)], ['reference', reference, THIN_REFERENCE]] as const;
  for (const [side, names, from] of sources) {
    if (side === 'other' && names.length === 0) continue;
    writer.mkdir(`${dir}/${side}`);
    names.forEach((name, index) => { packet[side].push(...copyCapture(writer, join(root, from, name), `${dir}/${side}`, index).map(file => `${side}/${file}`)); });
  }
  put(writer, comparePath(cycle), `${JSON.stringify({ result: cycle, other: packet.other.length === 0 ? null : against }, null, 2)}\n`);
  return packet;
}

/** Every image in a packet folder (assembled here or by hand), result first, as absolute paths. */
export function packetImages(dir: string): string[] {
  return SIDES.flatMap(side => existsSync(join(dir, side))
    ? readdirSync(join(dir, side)).filter(name => IMAGE.test(name)).sort().map(name => join(dir, side, name)) : []);
}
