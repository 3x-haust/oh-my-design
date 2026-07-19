import type { ChildProcessWithoutNullStreams } from 'node:child_process';

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type JsonRecord = object;
type ExitResult = { readonly code: number | null; readonly signal: NodeJS.Signals | null };
type Pending = { readonly resolve: (value: JsonRecord) => void; readonly reject: (error: Error) => void; readonly timer: NodeJS.Timeout };

const MAX_STDERR_CHARS = 64 * 1024;
const MAX_STDOUT_LINE_CHARS = 64 * 1024;

export class BrowserRsStdioError extends Error {
  override readonly name = 'BrowserRsStdioError';
  readonly reason: 'malformed-json' | 'process' | 'protocol' | 'timeout';

  constructor(reason: 'malformed-json' | 'process' | 'protocol' | 'timeout', message: string) {
    super(message);
    this.reason = reason;
  }
}

function record(value: unknown): JsonRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value;
}

function field(value: JsonRecord, key: string): unknown {
  return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

function errorText(value: unknown): string {
  const error = record(value);
  const message = error === undefined ? undefined : field(error, 'message');
  return typeof message === 'string' ? message : 'an unspecified error';
}

export class BrowserRsStdioClient {
  readonly child: ChildProcessWithoutNullStreams;
  readonly responseTimeoutMs: number;
  readonly #pending = new Map<number, Pending>();
  readonly #exit: Promise<ExitResult>;
  #buffer = '';
  #nextId = 1;
  #stderr = '';
  #exited: ExitResult | undefined;
  #inputClosed = false;
  #terminalError: BrowserRsStdioError | undefined;

  constructor(child: ChildProcessWithoutNullStreams, responseTimeoutMs: number) {
    this.child = child;
    this.responseTimeoutMs = responseTimeoutMs;
    this.#exit = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        const result = { code, signal };
        this.#exited = result;
        this.#failPending(new BrowserRsStdioError('process', `browser-rs exited with ${describeExit(result)}`));
        resolve(result);
      });
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.#read(chunk));
    child.stderr.on('data', (chunk: string) => this.#captureStderr(chunk));
    child.stdin.on('error', (error) => this.#failPending(new BrowserRsStdioError('process', `browser-rs stdin failed: ${error.message}`)));
  }

  request(method: string, params: JsonValue): Promise<JsonRecord> {
    if (this.#terminalError !== undefined) return Promise.reject(this.#terminalError);
    if (this.#exited !== undefined) return Promise.reject(new BrowserRsStdioError('process', `browser-rs exited with ${describeExit(this.#exited)}`));
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new BrowserRsStdioError('timeout', `browser-rs ${method} timed out after ${this.responseTimeoutMs}ms`));
      }, this.responseTimeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, (error) => {
        if (error !== undefined && error !== null) this.#settle(id, new BrowserRsStdioError('process', `browser-rs stdin failed: ${error.message}`));
      });
    });
  }

  notify(method: string, params: JsonValue): void {
    if (this.#terminalError !== undefined) throw this.#terminalError;
    if (this.#exited !== undefined) throw new BrowserRsStdioError('process', `browser-rs exited with ${describeExit(this.#exited)}`);
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  closeInput(): void {
    if (this.#inputClosed) return;
    this.#inputClosed = true;
    this.child.stdin.end();
  }

  waitForExit(timeoutMs: number): Promise<ExitResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new BrowserRsStdioError('timeout', `browser-rs process did not exit after ${timeoutMs}ms`)), timeoutMs);
      this.#exit.then((result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  kill(): void {
    if (this.#exited === undefined) this.child.kill('SIGKILL');
  }

  stderr(): string {
    return this.#stderr;
  }

  #read(chunk: string): void {
    let start = 0;
    while (this.#terminalError === undefined) {
      const newline = chunk.indexOf('\n', start);
      const part = chunk.slice(start, newline < 0 ? undefined : newline);
      if (part.length > MAX_STDOUT_LINE_CHARS - this.#buffer.length) {
        this.#terminal(new BrowserRsStdioError('protocol', `browser-rs ${newline < 0 ? 'stdout line' : 'JSON-RPC response'} exceeded ${MAX_STDOUT_LINE_CHARS} characters`));
        return;
      }
      this.#buffer += part;
      if (newline < 0) return;
      const line = this.#buffer.trim();
      this.#buffer = '';
      if (line !== '') this.#response(line);
      start = newline + 1;
    }
  }

  #response(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.#failPending(new BrowserRsStdioError('malformed-json', 'browser-rs wrote malformed JSON-RPC output'));
        return;
      }
      throw error;
    }
    const message = record(parsed);
    const id = message === undefined ? undefined : field(message, 'id');
    if (message === undefined || typeof id !== 'number') return;
    const pending = this.#pending.get(id);
    if (pending === undefined) return;
    if (field(message, 'jsonrpc') !== '2.0') return this.#settle(id, new BrowserRsStdioError('protocol', 'browser-rs response did not use JSON-RPC version 2.0'));
    const error = field(message, 'error');
    if (error !== undefined) return this.#settle(id, new BrowserRsStdioError('protocol', `browser-rs request failed: ${errorText(error)}`));
    const result = record(field(message, 'result'));
    if (result === undefined) return this.#settle(id, new BrowserRsStdioError('protocol', 'browser-rs response omitted an object result'));
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    pending.resolve(result);
  }

  #settle(id: number, error: Error): void {
    const pending = this.#pending.get(id);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    pending.reject(error);
  }

  #failPending(error: Error): void {
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.#pending.delete(id);
    }
  }

  #terminal(error: BrowserRsStdioError): void {
    if (this.#terminalError !== undefined) return;
    this.#terminalError = error;
    this.#buffer = '';
    this.#failPending(error);
    this.kill();
  }

  #captureStderr(chunk: string): void {
    const remaining = MAX_STDERR_CHARS - this.#stderr.length;
    if (remaining > 0) this.#stderr += chunk.slice(0, remaining);
  }
}

function describeExit(result: ExitResult): string {
  return result.signal === null ? `code ${String(result.code)}` : `signal ${result.signal}`;
}
