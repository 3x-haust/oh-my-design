import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { capturePiRequest, readPiRequest } from '../extensions/omd-request-source.ts';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Publish a real host-signed request quote for CLI integration fixtures. */
export function publishReadingJudgment(root: string,
  authored: { kind: string; text: string; request: string; sourceContractSha256: string; chosenId: string | null },
  run: (...args: string[]) => { status: number | null; stdout: string; stderr: string },
): string {
  // CLI fixtures classify a route directly, without a Pi turn. Seal that fixture's
  // original request as a native observation before publishing a reading judgment.
  const request = readPiRequest(root) ?? capturePiRequest(root, authored.request);
  if (request.request !== authored.request) throw new Error('fixture route request changed');
  const input = {
    schema: 'ai-judgment-v1', purpose: 'design-language-reading', subjectId: authored.kind,
    context: { requestSha256: request.requestSha256, sourceContractSha256: authored.sourceContractSha256, questionDigest: null, documentSha256: null },
    decision: authored.chosenId === null ? 'ambiguous' : 'resolved', reason: 'The owner chose this reading for the request.',
    quotes: [{ source: { kind: 'route-request', requestSourceSha256: request.recordSha256, requestSha256: request.requestSha256 }, field: 'request', itemId: null, text: request.request }],
    evidence: [], payload: { kind: authored.kind, textSha256: sha(authored.text), chosenId: authored.chosenId },
  };
  const path = '.omd/.cache/reading-judgment.json';
  writeFileSync(join(root, path), JSON.stringify(input));
  const result = run('ai-judgment', 'publish', '--input', path);
  if (result.status !== 0) throw new Error(result.stderr);
  return (JSON.parse(result.stdout) as { receipt: { path: string } }).receipt.path;
}
