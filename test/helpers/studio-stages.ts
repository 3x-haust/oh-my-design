import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

/**
 * Fixtures for the asset-first stages, written the way their publishers leave them (omd studio board, omd studio sheet,
 * omd imagegen, omd studio asset) so a test can move past a stage without a browser or an image tool.
 */
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const write = (root: string, path: string, content: string | Buffer) => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
};
const png = (seed: number): Buffer => {
  const image = new PNG({ width: 4, height: 4 });
  for (let at = 0; at < image.data.length; at += 4) image.data.set([seed % 256, (seed * 7) % 256, (seed * 13) % 256, 255], at);
  return PNG.sync.write(image);
};

export function idea(root: string, name: string, kind: string, seed: number, prompt = `${kind} candidate ${name}`): string {
  const path = `.omd/ideas/${name}.png`;
  write(root, path, png(seed));
  write(root, `.omd/ideas/${name}.json`, JSON.stringify({ prompt, kind, name: name.replace(/-\d+$/, ''), tool: 'codex exec (image_generation)', references: [] }));
  return path;
}

export function sheet(root: string, name: string, members: readonly string[]): void {
  const record = { schema: 'studio-sheet-v1', name, board: null, image: { path: `.omd/studio/sheets/${name}.png`, sha256: 'x' },
    members: members.map((source, index) => ({ label: String.fromCharCode(65 + index), source, sha256: sha(readFileSync(join(root, source))) })) };
  write(root, `.omd/studio/sheets/${name}.png`, png(1));
  write(root, `.omd/studio/sheets/${name}.json`, JSON.stringify(record));
}

/** A reference board with one kept image for one element, composed. */
export function pinBoard(root: string): void {
  write(root, '.omd/refs/design/ledger-row.png', png(200));
  const input = JSON.stringify({ items: [{ image: '.omd/refs/design/ledger-row.png', for: 'transaction list', job: 'row density and amount alignment', source: 'https://dribbble.com/shots/1' }] });
  write(root, '.omd/studio/board.json', input);
  write(root, '.omd/studio/board.png', png(3));
  write(root, '.omd/studio/board-sheet.json', JSON.stringify({ schema: 'studio-board-v1', input: sha(Buffer.from(input)), image: { path: '.omd/studio/board.png', sha256: 'x' },
    items: [{ image: '.omd/refs/design/ledger-row.png', for: 'transaction list', job: 'row density and amount alignment', source: 'https://dribbble.com/shots/1', sha256: sha(png(200)) }] }));
}

/** Three concept boards on one sheet and one chosen. */
export function chooseDirection(root: string): readonly string[] {
  const boards = ['concept-a-1', 'concept-b-1', 'concept-c-1'].map((name, index) => idea(root, name, 'board', 40 + index));
  sheet(root, 'concepts', boards);
  write(root, '.omd/studio/direction.json', JSON.stringify({ sheet: 'concepts', chosen: boards[0], because: 'the coins become the ledger itself, which no other board found',
    lost: boards.slice(1).map(board => ({ board, because: 'a recoloured card dashboard' })), carry: ['coins as the unit of every list'] }));
  return boards;
}

/** Three asset candidates compared in pairs, the winner shipped with its provenance. */
export function shipAssets(root: string): readonly string[] {
  const candidates = [1, 2, 3].map(index => idea(root, `coins-${index}`, 'asset', 90 + index));
  sheet(root, 'coins', candidates);
  write(root, '.omd/studio/assets.json', JSON.stringify({ sets: [{ name: 'coins', for: 'every list and the home balance', sheet: 'coins', chosen: candidates[1],
    rounds: [{ a: candidates[0], b: candidates[1], winner: candidates[1], because: 'one light across the set' },
      { a: candidates[1], b: candidates[2], winner: candidates[1], because: 'the third set has one odd item' }] }] }));
  write(root, 'public/assets/coins-1.png', png(7));
  write(root, '.omd/studio/images.json', JSON.stringify([{ file: 'public/assets/coins-1.png', source: `omd imagegen ${candidates[1]}`, licence: 'own',
    generated: { tool: 'codex exec (image_generation)', prompt: 'coins', candidate: candidates[1], kind: 'asset', set: 'coins' } }]));
  return candidates;
}
