import { createHash } from 'node:crypto';

export function compactPiRouteOutput(stdout: string, args: readonly string[]): string | undefined {
  if (args[0] !== 'route' || !['classify', 'show'].includes(args[1] ?? '') || !args.includes('--json')) return;
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); }
  catch (error) { if (error instanceof SyntaxError) return; throw error; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
    || !('schema' in parsed) || parsed.schema !== 'adaptive-design-route-v1'
    || !('request' in parsed) || typeof parsed.request !== 'string'
    || !('sourceContract' in parsed) || !('sourceContractSha256' in parsed)
    || typeof parsed.sourceContractSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(parsed.sourceContractSha256)) return;
  const { request, sourceContract: _sourceContract, ...route } = parsed;
  return JSON.stringify({ schema: 'omd-route-summary-v1', published: args[1] === 'classify', routePath: '.omd/route.json', route,
    requestSource: { path: `.omd/route-sources/sha256-${parsed.sourceContractSha256}.json`, field: 'request',
      sha256: createHash('sha256').update(request).digest('hex'), characters: request.length },
    omittedFields: ['request', 'sourceContract'],
    next: 'The complete original request remains in the source record. Read that file when its contents are needed; this transport summary is not a replacement brief.' });
}
