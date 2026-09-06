import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { BROWSER_RS_TEMPORARY_REAPER } from './browser-rs-temporary-reaper.ts';

type TemporaryKind = 'profile' | 'screenshot';
type JsonRecord = object;
type ReaperMessage =
  | { readonly type: 'ready'; readonly token: string; readonly path: string }
  | { readonly type: 'cleaned'; readonly token: string; readonly removed: boolean }
  | { readonly type: 'error'; readonly token: string; readonly error: string; readonly code: string };

export class BrowserRsTemporaryInitError extends Error {
  override readonly name = 'BrowserRsTemporaryInitError';
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type BrowserRsTemporaryResource = {
  readonly kind: TemporaryKind;
  readonly path: string;
  cleanup(): Promise<boolean>;
};

const REAPER_RESPONSE_TIMEOUT_MS = 5_000;

function record(value: unknown): JsonRecord | undefined {
  return value === null || typeof value !== 'object' || Array.isArray(value) ? undefined : value;
}

function field(value: JsonRecord, key: string): unknown {
  return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

function reaperMessage(value: unknown, token: string): ReaperMessage | undefined {
  const message = record(value);
  if (message === undefined || field(message, 'token') !== token) return undefined;
  const type = field(message, 'type');
  if (type === 'ready') {
    const path = field(message, 'path');
    return typeof path === 'string' ? { type, token, path } : undefined;
  }
  if (type === 'cleaned') {
    const removed = field(message, 'removed');
    return typeof removed === 'boolean' ? { type, token, removed } : undefined;
  }
  if (type === 'error') {
    const error = field(message, 'error');
    const code = field(message, 'code');
    return typeof error === 'string' && typeof code === 'string' ? { type, token, error, code } : undefined;
  }
  return undefined;
}

function response(child: ChildProcess, token: string): Promise<ReaperMessage> {
  return new Promise((resolve, reject) => {
    const finish = (error: Error | undefined, value?: ReaperMessage): void => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      if (error !== undefined) reject(error);
      else if (value !== undefined) resolve(value);
    };
    const onMessage = (value: unknown): void => {
      const parsed = reaperMessage(value, token);
      if (parsed !== undefined) finish(undefined, parsed);
    };
    const onExit = (): void => finish(new Error('browser-rs temporary capability reaper exited before acknowledging the lease'));
    const timer = setTimeout(() => finish(new Error('browser-rs temporary capability reaper acknowledgement timed out')), REAPER_RESPONSE_TIMEOUT_MS);
    child.on('message', onMessage);
    child.once('exit', onExit);
  });
}

function childExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

export async function createBrowserRsTemporaryResource(parent: string, kind: TemporaryKind): Promise<BrowserRsTemporaryResource> {
  const token = randomUUID();
  const reaper = spawn(process.execPath, ['-e', BROWSER_RS_TEMPORARY_REAPER], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const ready = response(reaper, token);
  reaper.send({ type: 'init', token, parent, kind });
  const initialized = await ready;
  if (initialized.type === 'error') {
    await childExit(reaper);
    throw new BrowserRsTemporaryInitError(initialized.code, initialized.error);
  }
  if (initialized.type !== 'ready') {
    await childExit(reaper);
    throw new Error('browser-rs temporary capability reaper returned an unexpected initialization response');
  }
  reaper.unref();
  reaper.channel?.unref();
  let cleaned = false;
  return {
    kind,
    path: initialized.path,
    async cleanup(): Promise<boolean> {
      if (cleaned) return true;
      const completion = response(reaper, token);
      reaper.send({ type: 'cleanup', token });
      const result = await completion;
      if (result.type === 'error') throw new BrowserRsTemporaryInitError(result.code, result.error);
      if (result.type !== 'cleaned') throw new Error('browser-rs temporary capability reaper returned an unexpected cleanup response');
      cleaned = result.removed;
      return result.removed;
    },
  };
}
