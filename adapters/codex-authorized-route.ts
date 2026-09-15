import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AdaptiveRouteRecord } from '../core/route/adaptive-flow-domain.ts';

/** Read through the issuing canonical CLI so route-owned AI provenance is reauthorized.
 * A second authority-free parse would reject valid AI-bearing routes. The host still binds the
 * current immutable route again before granting any role or production write transaction.
 */
export function readCodexAuthorizedRoute(projectRoot: string, env: NodeJS.ProcessEnv): AdaptiveRouteRecord {
  const cli = realpathSync(fileURLToPath(new URL('../bin/omd.mjs', import.meta.url)));
  const result = spawnSync(process.execPath, [cli, 'route', 'show', '--json'], {
    cwd: projectRoot, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`ROLE_ROUTE_INVALID: ${result.stderr || result.error?.message || 'canonical route read failed'}`);
  return JSON.parse(result.stdout) as AdaptiveRouteRecord;
}
