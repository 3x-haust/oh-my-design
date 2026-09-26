export async function withNativeCommandSignal<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const interrupt = (): void => controller.abort(new Error('OMD_NATIVE_COMMAND_CANCELLED'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try { return await run(controller.signal); }
  finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
