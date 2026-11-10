import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

/**
 * The material stage, shipped as source the project owns. A key visual that is one authored object (the mark made of
 * glass, a letter cast in clay) took twenty-seven rounds to light by hand; the stage starts from that result: the studio
 * environment, the materials, a tone map that keeps the page's paper exact, soft shadows, an entrance and a rest state.
 * The page's work is the shape and what it does, not the lighting.
 */
export const MATERIAL_STAGE_SOURCE = join(dirname(fileURLToPath(import.meta.url)), 'material-stage/materialStage.ts.txt');
export const MATERIAL_STAGE_FILE = 'materialStage.ts';
export const MATERIAL_STAGE_NEXT = 'Add three and @types/three (MIT). Pass a canvas and the real shape: createMaterialStage(canvas, { shapes: [{ path: '
  + '"<the mark\'s SVG path d>" }], paper: "<the page background>", color: "<the brand colour>", material: "glass" | "clay" | "porcelain" | "ink-metal", '
  + 'entrance: "rise", idle: "float", offset: { wide: [0.18, 0], tall: [0, -0.12] }, onFrame }). Put the canvas inside the element marked data-product, '
  + 'at least half the first screen; add your own choreography in onFrame (seconds since arrival, the objects, the camera). Hold a frame with ?t=1.2 '
  + 'and look at it with omd studio look. Reduced motion renders the rest state once. omd pack guides/material-stage.md has the craft notes.';

export function installMaterialRig(root: string, writer: ProjectWriteAdapter, directory = 'src/stage'): Readonly<{ files: readonly string[]; next: string }> {
  const clean = directory.replace(/^\.?\/+|\/+$/g, '');
  if (clean === '' || clean.split('/').includes('..')) throw new Error('omd studio rig --out names a folder inside the project');
  const path = `${clean}/${MATERIAL_STAGE_FILE}`;
  if (existsSync(join(root, path))) return { files: [path], next: `${path} is already here and was left as it is. ${MATERIAL_STAGE_NEXT}` };
  writer.mkdir(clean);
  writer.write(path, readFileSync(MATERIAL_STAGE_SOURCE, 'utf8'));
  return { files: [path], next: MATERIAL_STAGE_NEXT };
}
