import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { PI_REVIEWER_EVENT_PREFIX, PiReviewerError, piParse, piRecord } from './pi-reviewer-contract.ts';

type Pending = Readonly<{ resolve(value: Record<string, unknown>): void; reject(error: Error): void; dispose(): void }>;
export class PiReviewerRpc {
  readonly child: ChildProcessWithoutNullStreams;
  readonly events: Record<string, unknown>[] = [];
  readonly #pending = new Map<string, Pending>();
  readonly #waiters = new Set<Readonly<{ type: string; pending: Pending }>>();
  readonly #transcript = createHash('sha256');
  readonly #closed: Promise<Readonly<{ code: number | null; signal: string | null }>>;
  readonly #processGroup: boolean;
  #failure: Error | undefined;
  #bytes = 0;
  #count = 0;
  #stderr = '';
  #terminationSent = false;
  #killSent = false;

  constructor(input: Readonly<{ command: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal; processGroup?: boolean }>) {
    this.#processGroup = input.processGroup === true && process.platform !== 'win32';
    this.child = spawn(input.command, [...input.args], { cwd: input.cwd, env: input.env, stdio: 'pipe', detached: this.#processGroup });
    const accept = (line: string, metadata = false): void => {
      try {
        this.#bytes += Buffer.byteLength(line);
        if (this.#bytes > 128 * 1024 * 1024) throw new PiReviewerError('rpc-output-limit');
        this.#count += 1; this.#transcript.update(line).update('\n');
        const event = piRecord(piParse(line, 'rpc-json'), 'rpc-event');
        if (metadata && !['omd_reviewer_ready', 'omd_reviewer_provider_request'].includes(String(event.type))) throw new PiReviewerError('extension-metadata-type');
        const pending = typeof event.id === 'string' ? this.#pending.get(event.id) : undefined;
        if (pending !== undefined) {
          this.#pending.delete(String(event.id)); pending.dispose(); pending.resolve(event);
        } else {
          this.events.push(event);
          for (const waiter of this.#waiters) {
            if (event.type !== waiter.type) continue;
            this.#waiters.delete(waiter); waiter.pending.dispose(); waiter.pending.resolve(event);
          }
        }
      } catch (error) { this.#fail(error instanceof Error ? error : new PiReviewerError('rpc-output')); }
    };
    createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on('line', line => accept(line));
    createInterface({ input: this.child.stderr, crlfDelay: Infinity }).on('line', line => {
      if (line.startsWith(PI_REVIEWER_EVENT_PREFIX)) accept(line.slice(PI_REVIEWER_EVENT_PREFIX.length), true);
    });
    this.child.stderr.on('data', bytes => { this.#stderr = `${this.#stderr}${String(bytes)}`.slice(-12_000); });
    this.child.stdin.on('error', error => this.#fail(error));
    this.child.on('error', error => this.#fail(error));
    this.#closed = new Promise(resolve => this.child.once('close', (code, signal) => {
      resolve({ code, signal }); this.#fail(new PiReviewerError(`child-exited:${code ?? signal ?? 'unknown'}:${this.#stderr}`));
    }));
    const abort = () => this.#fail(new PiReviewerError('cancelled'));
    input.signal?.addEventListener('abort', abort, { once: true });
    void this.#closed.then(() => input.signal?.removeEventListener('abort', abort));
    if (input.signal?.aborted) abort();
  }
  get eventCount(): number { return this.#count; }
  get stderr(): string { return this.#stderr; }
  get transcriptSha256(): string { return this.#transcript.copy().digest('hex'); }
  #terminate(signal: NodeJS.Signals): void {
    if (signal === 'SIGTERM' && this.#terminationSent) return;
    if (signal === 'SIGKILL' && this.#killSent) return;
    if (!this.#processGroup || this.child.pid === undefined) { this.child.kill(signal); return; }
    try {
      process.kill(-this.child.pid, signal);
      if (signal === 'SIGKILL') this.#killSent = true;
      else this.#terminationSent = true;
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error)) throw error;
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        this.child.kill(signal);
        if (signal === 'SIGKILL') this.#killSent = true;
        else this.#terminationSent = true;
      } else if (error.code !== 'ESRCH') throw error;
    }
  }
  #fail(error: Error): void {
    this.#failure ??= error;
    for (const pending of this.#pending.values()) { pending.dispose(); pending.reject(error); }
    this.#pending.clear();
    for (const { pending } of this.#waiters) { pending.dispose(); pending.reject(error); }
    this.#waiters.clear();
    if (this.#processGroup || (this.child.exitCode === null && this.child.signalCode === null)) this.#terminate('SIGTERM');
  }
  #promise(register: (pending: Pending) => void, timeoutMs: number): Promise<Record<string, unknown>> {
    if (this.#failure !== undefined) return Promise.reject(this.#failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#fail(new PiReviewerError('rpc-timeout')), timeoutMs);
      register({ resolve, reject, dispose: () => clearTimeout(timer) });
    });
  }
  async request(payload: Readonly<Record<string, unknown>>, timeoutMs = 30_000): Promise<Record<string, unknown>> {
    if (this.#failure !== undefined) throw this.#failure;
    const id = randomUUID();
    const response = this.#promise(pending => this.#pending.set(id, pending), timeoutMs);
    this.child.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
    const value = await response;
    if (value.success === false || value.error !== undefined) throw new PiReviewerError('rpc-command-failed');
    return value;
  }
  waitEvent(type: string, timeoutMs = 10 * 60_000): Promise<Record<string, unknown>> {
    const found = this.events.find(event => event.type === type);
    if (found !== undefined) return Promise.resolve(found);
    return this.#promise(pending => this.#waiters.add({ type, pending }), timeoutMs);
  }
  async finish(): Promise<void> {
    this.child.stdin.end();
    const timer = setTimeout(() => this.#terminate('SIGKILL'), 10_000);
    try {
      const exit = await this.#closed;
      if (exit.code !== 0 || exit.signal !== null) throw new PiReviewerError(`child-completion:${exit.code ?? exit.signal}`);
    } finally { clearTimeout(timer); if (this.#processGroup) this.#terminate('SIGKILL'); }
  }
  async dispose(): Promise<void> {
    if (!this.#processGroup && (this.child.exitCode !== null || this.child.signalCode !== null)) return;
    this.#terminate('SIGTERM');
    const timer = setTimeout(() => this.#terminate('SIGKILL'), 1_000);
    try { await this.#closed; } finally { clearTimeout(timer); if (this.#processGroup) this.#terminate('SIGKILL'); }
  }
}
