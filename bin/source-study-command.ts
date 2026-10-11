import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { createSourceStudySet, selectSourceStudy, readSelectedSourceStudy, readLatestSourceStudySet } from '../core/art-direction/source-study.ts';
import { SourceStudyContractError } from '../adapters/pi-study-contract.ts';
import { piDigest, piRecord, piText } from '../adapters/pi-reviewer-contract.ts';
import { withNativeCommandSignal } from './native-command-signal.ts';

export async function sourceStudyCommand(
  mode: string | undefined, input: unknown,
  context: Readonly<{ root: string; invocation: ProjectRunInvocation }>,
) {
  switch (mode) {
    case 'create':
      if (input === undefined) throw new SourceStudyContractError('create-input-required');
      return withNativeCommandSignal(signal =>
        createSourceStudySet(context.root, context.invocation, input, signal));
    case 'select': {
      const row = piRecord(input, 'study-selection-input');
      if (Object.keys(row).sort().join() !== 'reason,schema,setSha256,variantId'
        || row.schema !== 'source-study-selection-input-v1') {
        throw new SourceStudyContractError('selection-input');
      }
      return selectSourceStudy(context.root, context.invocation, {
        setSha256: piDigest(row.setSha256, 'study-set'),
        variantId: piText(row.variantId, 'study-variant'),
        reason: piText(row.reason, 'study-reason'),
      });
    }
    case 'show':
      if (input !== undefined) throw new SourceStudyContractError('show-does-not-take-input');
      return readSelectedSourceStudy(context.root, context.invocation);
    case 'latest':
      if (input !== undefined) throw new SourceStudyContractError('latest-does-not-take-input');
      return readLatestSourceStudySet(context.root, context.invocation);
    default:
      throw new SourceStudyContractError('use study create|select --input <json> or study show|latest');
  }
}
