import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

function shellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Bind command examples to the issuing package, independently of shell PATH. */
export function codexCliContext(ownerCliPath: string, nodePath = process.execPath): string {
  const cli = realpathSync(join(dirname(ownerCliPath), 'omd.ts'));
  const command = `${shellWord(nodePath)} ${shellWord(cli)}`;
  return [
    'CLI binding: every `omd` command in the role profile or task means the following exact command prefix:',
    command,
    'Append the requested subcommand and arguments to this prefix. Do not use bare `omd`, npx, a PATH shim, another installation, or recursively launch omd-codex exec.',
    'Keep the inherited OMD_ACTIVATION_PATH and role environment unchanged; the issuing CLI reads them directly. Changing the command prefix does not authorize additional operations.',
  ].join('\n');
}
