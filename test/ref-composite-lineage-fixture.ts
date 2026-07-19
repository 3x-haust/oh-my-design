import { deflateSync, crc32 } from 'node:zlib';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { TestContext } from 'node:test';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import { selectReferenceCandidate } from '../core/ref/reference-selection.ts';

type Fixture = {
  readonly root: string;
  readonly compositePath: string;
  readonly promptPath: string;
};

const chunk = (type: string, bytes: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const body = Buffer.concat([Buffer.from(type), bytes]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
};

const png = (): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 12, 34, 56]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

export const compositeLineageFixture = (context: TestContext): Fixture => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'omd-composite-lineage-'));
  const refs = join(root, '.omd', 'refs');
  mkdirSync(refs, { recursive: true });
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const source = join(refs, 'source.png');
  writeFileSync(source, png());
  const fragment = persistImageFragment(root, {
    inputPath: relative(root, source),
    provenance: {
      sourcePage: 'https://gallery.example/pin/one',
      captureRegion: 'selected colour study',
      licenseStatus: 'unknown',
      rightsNotes: 'Verify rights before publication.',
      capturedAt: '2026-07-18T00:00:00.000Z',
    },
    transfer: {
      visualRole: 'atmosphere',
      principles: ['Keep contrast independent from the reference.'],
    },
  });
  const board = {
    schemaVersion: 'reference-board-v1',
    frameSha256: 'a'.repeat(64),
    candidates: [{
      id: 'clean-room-one',
      label: 'Clean room one',
      route: '/work',
      rationale: 'Use locally measured structure only.',
      pieces: [{
        slotId: 'atmosphere',
        sourceKind: 'image-fragment',
        referenceId: fragment.id,
        targetComponent: 'hero',
        targetSelector: '[data-omd="hero"]',
        taskIds: ['T1'],
        reason: 'Keep the visual field distinct.',
        take: ['density'],
        avoid: 'Do not replicate source composition.',
        adaptation: 'Use project spacing and copy.',
        grid: { column: 1, span: 12, order: 0 },
      }],
    }],
  };
  writeFileSync(join(root, '.omd', 'reference-board.json'), `${JSON.stringify(board)}\n`);
  selectReferenceCandidate(root, 'clean-room-one');
  const drafts = join(root, '.omd', '.cache', 'imagegen');
  mkdirSync(drafts, { recursive: true });
  const compositePath = join(drafts, 'draft-01.png');
  const promptPath = join(drafts, 'draft-01.prompt.txt');
  writeFileSync(compositePath, png());
  writeFileSync(promptPath, 'Create a clean-room concept draft from the selected assembly.');
  return { root, compositePath, promptPath };
};
