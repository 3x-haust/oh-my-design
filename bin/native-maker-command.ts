import { makerFail } from '../adapters/pi-maker-contract.ts';
import { makeNativeSource } from '../core/runtime/native-maker.ts';
import type { NativeMakerContext } from '../core/runtime/native-maker-packet.ts';
import { withNativeCommandSignal } from './native-command-signal.ts';
import { restoreNativeMaker } from '../core/runtime/native-maker-restore.ts';

export async function nativeMakerCommand(mode: string | undefined, context: NativeMakerContext) {
  if (mode === 'restore') return restoreNativeMaker(context);
  if (mode !== 'run') return makerFail('use omd maker run|restore --input <native-maker-input.json> --json');
  const publication = await withNativeCommandSignal(signal => makeNativeSource({ ...context, signal }));
  const receipt = publication.receipt;
  return {
    schema: 'native-maker-publication-v2' as const,
    paths: publication.paths,
    receiptPath: publication.receiptPath,
    execution: {
      role: receipt.role,
      provider: receipt.provider,
      model: receipt.model,
      modelReasoningEffort: receipt.modelReasoningEffort,
      sessionId: receipt.sessionId,
      parentSessionId: receipt.parentSessionId,
      runtimeDurationMs: receipt.runtimeDurationMs,
      usage: receipt.usage,
    },
  };
}
