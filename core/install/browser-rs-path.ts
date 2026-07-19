import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export type BrowserRsEnvironment = Readonly<Record<string, string | undefined>>;

export function browserRsPathLookup(environment: BrowserRsEnvironment): string | undefined {
  const path = environment['PATH'];
  if (path === undefined) return undefined;
  for (const folder of path.split(delimiter)) {
    if (folder.length === 0) continue;
    const candidate = join(folder, 'browser-rs');
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch (error) {
      if (error instanceof Error) continue;
      throw error;
    }
  }
  return undefined;
}
