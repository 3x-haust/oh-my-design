import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { decodePng } from '../motion/energy.ts';
import { BrowserRsStdioClient } from './browser-rs-stdio.ts';

const REQUIRED_TOOLS = ['browser_navigate', 'browser_type', 'browser_click', 'browser_snapshot', 'browser_take_screenshot', 'browser_close'] as const;
const DEFAULT_RESPONSE_TIMEOUT_MS = 5_000;
const DEFAULT_PROCESS_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const SMOKE_NAME = 'OMD Smoke User';

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type JsonRecord = object;
type LocalFixture = { readonly server: Server; readonly url: string };

export type BrowserRsSpawner = (binary: string, args: readonly string[], environment: NodeJS.ProcessEnv) => ChildProcessWithoutNullStreams;
export type BrowserRsSmokeOptions = {
  readonly binary: string;
  readonly fixturePath: string;
  readonly outputPath: string;
  readonly responseTimeoutMs?: number;
  readonly processTimeoutMs?: number;
  readonly temporaryDirectory?: string;
  readonly spawn?: BrowserRsSpawner;
};
export type BrowserRsSmokeResult = {
  readonly fixtureUrl: string;
  readonly outputPath: string;
  readonly profilePath: string;
  readonly snapshot: string;
  readonly stderr: string;
  readonly typedName: string;
};

export class BrowserRsSmokeError extends Error { override readonly name = 'BrowserRsSmokeError'; }

export async function runBrowserRsSmoke(options: BrowserRsSmokeOptions): Promise<BrowserRsSmokeResult> {
  const responseTimeoutMs = timeout(options.responseTimeoutMs, DEFAULT_RESPONSE_TIMEOUT_MS, 'response');
  const processTimeoutMs = timeout(options.processTimeoutMs, DEFAULT_PROCESS_TIMEOUT_MS, 'process');
  const fixture = await localFixture(options.fixturePath);
  const temporaryDirectory = options.temporaryDirectory ?? tmpdir();
  let client: BrowserRsStdioClient | undefined;
  let profilePath: string | undefined;
  let screenshotDirectory: string | undefined;
  let closeSent = false;
  let protocolReady = false;
  let proof: { readonly screenshot: Buffer; readonly snapshot: string; readonly typedName: string } | undefined;
  try {
    profilePath = await mkdtemp(join(temporaryDirectory, 'omd-browser-rs-profile-'));
    screenshotDirectory = await mkdtemp(join(temporaryDirectory, 'omd-browser-rs-screenshot-'));
    const expectedScreenshotPath = join(screenshotDirectory, 'ab-p1.png');
    client = new BrowserRsStdioClient((options.spawn ?? spawnBrowserRs)(options.binary, ['--headless', '--stealth', '--user-data-dir', profilePath], { ...process.env, TMPDIR: screenshotDirectory }), responseTimeoutMs);
    const initialized = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'oh-my-design', version: '0.16.1' } });
    initializedTools(initialized);
    client.notify('notifications/initialized', {});
    protocolReady = true;
    requiredTools(await client.request('tools/list', {}));
    await tool(client, 'browser_navigate', { url: fixture.url });
    await tool(client, 'browser_type', { page: 'p1', selector: '#name', text: SMOKE_NAME, clear: true });
    await tool(client, 'browser_click', { page: 'p1', selector: '#toggle' });
    const snapshot = await tool(client, 'browser_snapshot', { page: 'p1' });
    const typedName = interactionProof(snapshot);
    const screenshot = await tool(client, 'browser_take_screenshot', { page: 'p1', path: expectedScreenshotPath });
    const bytes = await screenshotBytes(screenshot, expectedScreenshotPath, screenshotDirectory);
    await tool(client, 'browser_close', {});
    closeSent = true;
    proof = { screenshot: bytes, snapshot, typedName };
  } finally {
    try {
      if (client !== undefined) await closeClient(client, closeSent, protocolReady, processTimeoutMs);
    } finally {
      await closeFixture(fixture.server);
      if (profilePath !== undefined) await rm(profilePath, { recursive: true, force: true });
      if (screenshotDirectory !== undefined) await rm(screenshotDirectory, { recursive: true, force: true });
    }
  }
  if (proof === undefined || profilePath === undefined || client === undefined) throw new BrowserRsSmokeError('browser-rs smoke did not complete');
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, proof.screenshot);
  return { fixtureUrl: fixture.url, outputPath: options.outputPath, profilePath, snapshot: proof.snapshot, stderr: client.stderr(), typedName: proof.typedName };
}

function timeout(value: number | undefined, fallback: number, label: string): number { const result = value ?? fallback; if (!Number.isInteger(result) || result <= 0 || result > MAX_TIMEOUT_MS) throw new BrowserRsSmokeError(`${label} timeout must be a positive integer no greater than ${MAX_TIMEOUT_MS}ms`); return result; }

function spawnBrowserRs(binary: string, args: readonly string[], environment: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams { return spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], env: environment }); }

async function localFixture(path: string): Promise<LocalFixture> {
  const bytes = await readFile(path);
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/probe.html') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': bytes.length });
    response.end(bytes);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new BrowserRsSmokeError('loopback fixture did not bind a TCP port');
  return { server, url: `http://127.0.0.1:${address.port}/probe.html` };
}

async function closeFixture(server: Server): Promise<void> { await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))); }

function record(value: unknown): JsonRecord | undefined { return value === null || typeof value !== 'object' || Array.isArray(value) ? undefined : value; }

function field(value: JsonRecord, key: string): unknown { return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined; }

function initializedTools(result: JsonRecord): void {
  const capabilities = record(field(result, 'capabilities'));
  const tools = capabilities === undefined ? undefined : record(field(capabilities, 'tools'));
  if (field(result, 'protocolVersion') !== '2025-06-18' || tools === undefined) throw new BrowserRsSmokeError('browser-rs did not initialize protocol 2025-06-18 with tools capability');
}

function requiredTools(result: JsonRecord): void {
  const tools = field(result, 'tools');
  if (!Array.isArray(tools)) throw new BrowserRsSmokeError('browser-rs tools/list did not return tools');
  const names = new Set(tools.flatMap((item) => {
    const definition = record(item);
    const name = definition === undefined ? undefined : field(definition, 'name');
    return typeof name === 'string' ? [name] : [];
  }));
  for (const name of REQUIRED_TOOLS) if (!names.has(name)) throw new BrowserRsSmokeError(`browser-rs is missing required tool ${name}`);
}

async function tool(client: BrowserRsStdioClient, name: string, argumentsValue: JsonValue): Promise<string> {
  const result = await client.request('tools/call', { name, arguments: argumentsValue });
  const isError = field(result, 'isError') === true;
  const content = field(result, 'content');
  if (!Array.isArray(content)) throw new BrowserRsSmokeError(`browser-rs ${name} did not return tool content`);
  const text = content.flatMap((item) => {
    const value = record(item);
    const type = value === undefined ? undefined : field(value, 'type');
    const message = value === undefined ? undefined : field(value, 'text');
    return type === 'text' && typeof message === 'string' ? [message] : [];
  })[0];
  if (text === undefined) throw new BrowserRsSmokeError(`browser-rs ${name} did not return text content`);
  if (isError) throw new BrowserRsSmokeError(`browser-rs ${name} reported an error: ${text.slice(0, 1_024)}`);
  return text;
}

function screenshotPath(value: string, expected: string): string {
  const match = /^(.*\.png) \(\d+ bytes\)$/.exec(value);
  const path = match?.[1];
  if (path !== expected) throw new BrowserRsSmokeError('browser-rs screenshot result did not contain the owned screenshot path (temporary PNG path)');
  return path;
}

function interactionProof(snapshot: string): string {
  if (!snapshot.includes('Ready')) throw new BrowserRsSmokeError('browser-rs snapshot did not prove the visible Ready panel');
  const match = /Ready:\s*([^"\n]+)/.exec(snapshot);
  const typedName = match?.[1]?.trim();
  if (typedName !== SMOKE_NAME) throw new BrowserRsSmokeError('browser-rs snapshot did not prove the typed name');
  return typedName;
}

async function screenshotBytes(result: string, expected: string, directory: string): Promise<Buffer> {
  const path = screenshotPath(result, expected);
  try {
    if (!inside(await realpath(directory), await realpath(path))) throw new BrowserRsSmokeError('browser-rs screenshot resolved outside its owned directory');
    const bytes = await readFile(path);
    try {
      decodePng(bytes);
    } catch (error) {
      if (error instanceof Error) throw new BrowserRsSmokeError(`browser-rs screenshot is not a valid PNG: ${error.message}`);
      throw error;
    }
    return bytes;
  } finally {
    await rm(path, { force: true });
  }
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function closeClient(client: BrowserRsStdioClient, closeSent: boolean, protocolReady: boolean, processTimeoutMs: number): Promise<void> {
  if (!protocolReady) {
    client.closeInput();
    client.kill();
    await client.waitForExit(processTimeoutMs);
    return;
  }
  let cleanupError: Error | undefined;
  try {
    if (!closeSent) await tool(client, 'browser_close', {});
  } catch (error) {
    cleanupError = error instanceof Error ? error : new BrowserRsSmokeError('browser-rs close request failed');
  } finally {
    client.closeInput();
  }
  try {
    const exit = await client.waitForExit(processTimeoutMs);
    if (exit.code !== 0) cleanupError ??= new BrowserRsSmokeError(`browser-rs exited with ${exit.signal === null ? `code ${String(exit.code)}` : `signal ${exit.signal}`}`);
  } catch (error) {
    const waitError = error instanceof Error ? error : new BrowserRsSmokeError('browser-rs process did not exit');
    client.kill();
    try {
      await client.waitForExit(processTimeoutMs);
    } catch (killError) {
      if (killError instanceof Error) throw killError;
      throw new BrowserRsSmokeError('browser-rs process did not exit after kill');
    }
    cleanupError ??= waitError;
  }
  if (cleanupError !== undefined) throw cleanupError;
}
