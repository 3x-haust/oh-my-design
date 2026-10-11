import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readDomainObservation } from './domain-observation.ts';

/** Low-level signed family reader, deliberately independent of research/board validation. */
export function observedDomainServiceUrls(root: string): readonly string[] {
  const path = join(root, '.omd/discovery/domain/observations');
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('REFERENCE_DOMAIN_OBSERVATION_REQUIRED: unsafe observation directory');
  return readdirSync(path).flatMap(name => {
    if (!/^[a-f0-9]{64}\.json$/u.test(name)) return [];
    const sha256 = name.slice(0, -5);
    const capture = { path: `.omd/discovery/domain/observations/${name}`, sha256 };
    try {
      const bytes = readFileSync(join(path, name));
      const source = JSON.parse(bytes.toString('utf8')).source;
      const observation = readDomainObservation(root, { url: source, capture });
      return [observation.url, observation.finalUrl];
    } catch (error) { if (error instanceof Error) return []; throw error; }
  });
}
