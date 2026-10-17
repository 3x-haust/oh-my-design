import { modelLedCompletionFingerprint } from '../core/runtime/model-led-execution.ts';
import type { OmdRunResult, PortablePiApi } from './omd-runtime.ts';
import { structuredToolDiagnostic } from './omd-runtime.ts';

const attempts = new Map<string, string>();

export async function finishModelLedTurn(task: Readonly<{
  cwd: string;
  signal?: AbortSignal;
  interrupted(): boolean;
  run(args: readonly string[], cwd: string, signal?: AbortSignal): Promise<OmdRunResult>;
  pi: Pick<PortablePiApi, 'sendMessage'>;
}>): Promise<string> {
  const fingerprint = modelLedCompletionFingerprint(task.cwd);
  if (attempts.get(task.cwd) === fingerprint) {
    return 'OMD completion remains unverified. The production source and browser proposal have not changed since the retained attempt. Inspect its concrete failure before repairing; unchanged verification was not repeated.';
  }
  attempts.set(task.cwd, fingerprint);
  const args = ['lifecycle', 'finish', '--json'];
  let result: OmdRunResult;
  try { result = await task.run(args, task.cwd, task.signal); }
  catch (error) {
    const diagnostic = structuredToolDiagnostic(error, args);
    if (diagnostic === null) throw error;
    result = diagnostic;
  }
  if (task.interrupted()) return 'OMD completion interrupted; no completion claim is authorized.';
  const value: unknown = JSON.parse(result.text);
  if (typeof value !== 'object' || value === null
    || Reflect.get(value, 'schema') !== 'model-led-completion-result-v1') {
    throw new Error('MODEL_LED_COMPLETION_RESULT_INVALID');
  }
  // Package builds may legitimately change the source inventory during this attempt.
  attempts.set(task.cwd, modelLedCompletionFingerprint(task.cwd));
  const diagnostic = Reflect.get(value, 'diagnostic');
  const category = typeof diagnostic === 'object' && diagnostic !== null ? Reflect.get(diagnostic, 'category') : null;
  if (Reflect.get(value, 'ok') !== true && category !== 'authority' && category !== 'cancelled') {
    task.pi.sendMessage?.({ customType: 'omd-model-led-repair', display: false,
      content: `Inspect this concrete execution/review diagnosis and its actual captures. Repair the application or incorrect browser assertions without reducing requirements. Use your normal tools and delegate when useful. The harness will verify changed inputs automatically. Do not create design documents merely to satisfy procedure.\n${result.text}` },
    { triggerTurn: true, deliverAs: 'followUp' });
  }
  return result.text;
}
