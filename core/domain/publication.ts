import { checkBriefEntry } from '../brief/entry.ts';
import { readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { DomainBriefError, validateDomainBrief, type DomainBrief } from './domain-brief.ts';

export function publishDomainBrief(
  root: string,
  authored: unknown,
  packRoot: string,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): DomainBrief {
  const route = readPersistedRoute(root, invocation);
  const entry = checkBriefEntry(root, 'domain', packRoot, invocation);
  if (entry.blockers.length > 0) throw new DomainBriefError(entry.blockers.join('\n'));
  if (typeof authored !== 'object' || authored === null || Array.isArray(authored)) {
    throw new DomainBriefError('brief must be an object');
  }
  const brief = validateDomainBrief({ ...authored, request: route.request });
  writer.write('.omd/domain-brief.json', `${JSON.stringify(brief, null, 2)}\n`);
  return brief;
}
