import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mode = process.argv[2] ?? 'success';
const fakeRoot = process.env.OMD_FAKE_TEMPORARY_DIRECTORY ?? mkdtempSync(join(tmpdir(), 'omd-browser-rs-fake-'));
const methodLog = process.env.OMD_FAKE_METHOD_LOG;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
let buffer = '';
let closed = false;
let clicked = false;
let typedName = '';
let queue = Promise.resolve();
let overflowed = false;
let initialized = false;
let initializedNotification = false;

console.error(mode === 'oversized-stderr' ? 'x'.repeat(70 * 1024) : 'fake browser-rs stderr');

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: mode === 'wrong-jsonrpc' ? '2.1' : '2.0', id, result })}\n`);
}

function fail(id, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } })}\n`);
}

function tools() {
  const names = ['browser_navigate', 'browser_type', 'browser_click', 'browser_snapshot', 'browser_take_screenshot', 'browser_close'];
  return mode === 'missing-tool' ? names.filter((name) => name !== 'browser_click') : names;
}

function initializedCapabilities() {
  const value = mode === 'null-tools-capability' ? null : mode === 'scalar-tools-capability' ? 'tools' : mode === 'array-tools-capability' ? [] : {};
  return mode === 'missing-tools-capability' ? {} : { tools: value };
}

function malformedCapability() {
  return ['missing-tools-capability', 'null-tools-capability', 'scalar-tools-capability', 'array-tools-capability'].includes(mode);
}

function content(text, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

async function handle(message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return;
  if (methodLog !== undefined) appendFileSync(methodLog, `${String(message.method)}\n`);
  if (malformedCapability() && message.method !== 'initialize') return fail(message.id, 'unexpected method after invalid initialize');
  if (message.method === 'initialize') {
    if (message.jsonrpc !== '2.0' || message.params?.protocolVersion !== '2025-06-18') return fail(message.id, 'unexpected initialize request');
    if (mode === 'malformed-json') {
      process.stdout.write('{malformed json\n');
      return;
    }
    if (mode === 'oversized-line') {
      overflowed = true;
      process.stdout.write('x'.repeat(70 * 1024));
      return;
    }
    if (mode === 'oversized-json') {
      overflowed = true;
      send(message.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'browser-rs', version: '0.1.10' }, padding: 'x'.repeat(70 * 1024) });
      return;
    }
    initialized = true;
    send(message.id, { protocolVersion: '2025-06-18', capabilities: initializedCapabilities(), serverInfo: { name: 'browser-rs', version: '0.1.10' } });
    return;
  }
  if (overflowed) return;
  if (message.method === 'notifications/initialized') {
    if (!initialized || message.jsonrpc !== '2.0') process.exitCode = 30;
    else initializedNotification = true;
    return;
  }
  if (message.method !== 'tools/list' && message.method !== 'tools/call') return;
  if (message.method === 'tools/list') {
    if (!initializedNotification) return fail(message.id, 'initialized notification was missing or out of order');
    if (mode === 'timeout') return;
    if (mode === 'early-exit') process.exit(29);
    send(message.id, { tools: tools().map((name) => ({ name })) });
    return;
  }
  const params = message.params;
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return fail(message.id, 'missing tool parameters');
  const name = params.name;
  const argumentsValue = params.arguments;
  if (name === 'browser_close') {
    closed = true;
    send(message.id, content('browser closed'));
    return;
  }
  if (argumentsValue === null || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) return fail(message.id, 'missing tool arguments');
  if (name === 'browser_navigate') {
    if (typeof argumentsValue.url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+\/probe\.html$/.test(argumentsValue.url)) return fail(message.id, 'unexpected local fixture URL');
    const response = await fetch(argumentsValue.url);
    const html = await response.text();
    if (!response.ok || !html.includes('<title>Probe fixture</title>') || !html.includes('id="toggle"') || !html.includes('id="name" aria-label="Name"') || !html.includes('id="panel" hidden')) return fail(message.id, 'loopback fixture did not serve the required probe form');
    send(message.id, content('page p1\ntextbox "Name" [ref=e2]\nbutton "Show details" [ref=e1]'));
    return;
  }
  if (name === 'browser_type') {
    if (argumentsValue.page !== 'p1' || argumentsValue.selector !== '#name' || argumentsValue.text !== 'OMD Smoke User') return fail(message.id, 'unexpected type action');
    typedName = argumentsValue.text;
    send(message.id, content('typed into p1'));
    return;
  }
  if (name === 'browser_click') {
    if (argumentsValue.page !== 'p1' || argumentsValue.selector !== '#toggle' || typedName === '') return fail(message.id, 'unexpected click action');
    if (mode === 'tool-is-error') return send(message.id, content('click rejected by provider', true));
    clicked = true;
    send(message.id, content(`clicked on p1\n+ Ready: ${typedName}`));
    return;
  }
  if (name === 'browser_snapshot') {
    const snapshot = mode === 'wrong-result'
      ? 'page p1\ntextbox "Name" [ref=e2]'
      : mode === 'stale-snapshot'
        ? 'page p1\ntextbox "Name" [ref=e2]\nStaticText "Ready"'
        : clicked ? `page p1\ntextbox "Name" [ref=e2]\nStaticText "Ready: ${typedName}"` : 'page p1\ntextbox "Name" [ref=e2]';
    send(message.id, content(snapshot));
    return;
  }
  if (name === 'browser_take_screenshot') {
    if (mode === 'foreign-contract-screenshot') return send(message.id, content(`${process.env.OMD_FAKE_FOREIGN_SCREENSHOT} (${png.length} bytes)`));
    const screenshotPath = typeof argumentsValue.path === 'string' ? argumentsValue.path : undefined;
    if (screenshotPath === undefined || screenshotPath !== join(process.env.TMPDIR ?? tmpdir(), 'ab-p1.png')) return fail(message.id, 'unexpected owned screenshot path');
    if (mode === 'malformed-screenshot') return send(message.id, content('screenshot unavailable'));
    if (mode === 'base64-screenshot') return send(message.id, content(`data:image/png;base64,${png.toString('base64')}`));
    if (mode === 'external-screenshot') return send(message.id, content(`${join(fakeRoot, 'foreign.png')} (${png.length} bytes)`));
    writeFileSync(screenshotPath, mode === 'invalid-png' ? Buffer.from('not a PNG') : png);
    send(message.id, content(`${screenshotPath} (${mode === 'invalid-png' ? 9 : png.length} bytes)`));
    return;
  }
  fail(message.id, `unexpected tool ${String(name)}`);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf('\n');
    if (index < 0) return;
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (line.trim() === '') continue;
    try {
      queue = queue.then(() => handle(JSON.parse(line)));
    } catch {
      process.exitCode = 30;
    }
  }
});
process.stdin.on('end', () => {
  queue.then(() => {
    if (mode === 'process-timeout' || overflowed) setInterval(() => undefined, 1_000);
    else {
      if (process.env.OMD_FAKE_TEMPORARY_DIRECTORY === undefined) rmSync(fakeRoot, { recursive: true, force: true });
      process.exitCode = closed ? 0 : 31;
    }
  }).catch(() => { process.exitCode = 30; });
});
