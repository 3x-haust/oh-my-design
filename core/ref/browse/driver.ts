import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { canonicalJson, sha256 } from './json.ts';
import { verifyBrowseCommandTicket, type CommandTicket } from './authority.ts';
import { BrowseEngine } from './engine.ts';
import type { BrowseBrowserDependencies } from './browser.ts';
import { BrowseError, browseFail, type Binding, type BrowseAction, type DriverReply } from './contract.ts';

export type DriverRequest = { operation: 'action'; action: BrowseAction; expectHead: string | null }
  | { operation: 'pending' } | { operation: 'ack'; requestId: string; head: string | null };
export async function runBrowseDriver(binding: Binding, dependencies: BrowseBrowserDependencies & { clock?: () => number; monotonic?: () => number } = {}) {
  const engine = new BrowseEngine(binding, dependencies), capability = randomBytes(32).toString('hex'), challenge = randomBytes(32).toString('hex');
  let pending: { id: string; digest: string; reply: DriverReply } | null = null, busy = false;
  const completed = new Map<string, { digest: string; reply: DriverReply }>();
  const trace = (event: string) => { if (process.env.OMD_BROWSE_RPC_TRACE) process.stderr.write(`browse RPC ${event}\n`); };
  const server = createServer(async (request, response) => {
    request.socket.once('close', () => trace(`socket closed, complete=${request.complete}`));
    const send = (status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
    try {
      if (request.method !== 'POST' || request.url !== '/' || request.headers.origin || request.headers.authorization !== `Bearer ${capability}`) { send(403, { error: 'BROWSE_RPC_AUTHORITY' }); return; }
      let bytes = Buffer.alloc(0);
      for await (const part of request) { bytes = Buffer.concat([bytes, part]); if (bytes.length > 64 * 1024) browseFail('BROWSE_RPC_SIZE', 'bounded command required', 2); }
      const { ticket, args } = JSON.parse(bytes.toString('utf8')) as { ticket: CommandTicket; args: DriverRequest };
      verifyBrowseCommandTicket(binding, challenge, ticket, args);
      trace(`received ${args.operation}${args.operation === 'action' ? `:${args.action.verb}` : ''}, listening=${server.listening}`);
      response.once('finish', () => trace(`finished ${args.operation}, listening=${server.listening}`));
      if (busy) browseFail('BROWSE_SESSION_BUSY', 'one action in flight', 2);
      if (args.operation === 'pending') { send(200, pending); return; }
      if (args.operation === 'ack') {
        if (pending && (pending.id !== args.requestId || pending.reply.result.head !== args.head)) browseFail('BROWSE_ACK', 'acknowledgement does not bind pending reply', 2);
        if (pending) { completed.set(pending.id, { digest: pending.digest, reply: pending.reply }); pending = null; }
        send(200, { acknowledged: true });
        // server.close() terminates pooled keep-alive sockets even after response.finish.
        // The client has not necessarily consumed this ACK yet; use the bounded sealed
        // lease for cleanup instead of racing the response against listener shutdown.
        if (args.head && engine.events.at(-1)?.action.verb === 'end') {
          clearTimeout(cleanup);
          cleanup = setTimeout(() => { void close().catch(error => process.stderr.write(`${String(error)}\n`)); }, 120_000);
          cleanup.unref();
        }
        return;
      }
      if (args.operation !== 'action') browseFail('BROWSE_RPC_OPERATION', 'closed RPC surface', 2);
      const digest = sha256(canonicalJson(args));
      if (pending) {
        if (pending.id !== ticket.requestId || pending.digest !== digest) browseFail('BROWSE_PENDING_PUBLICATION', 'recover and acknowledge pending event before another action', 2);
        send(200, pending.reply); return;
      }
      const prior = completed.get(ticket.requestId);
      if (prior) {
        if (prior.digest !== digest) browseFail('BROWSE_REQUEST_REPLAY', 'a request id cannot be reused with different arguments', 2);
        send(200, prior.reply); return;
      }
      busy = true;
      try {
        const reply = await engine.execute(args.action, ticket.requestId, args.expectHead);
        if (reply.events.length || reply.seal) pending = { id: ticket.requestId, digest, reply };
        send(200, reply);
      } finally { busy = false; }
    } catch (error) {
      trace(`handler error ${error instanceof Error ? error.message : String(error)}`);
      send(error instanceof BrowseError ? 409 : 500, { code: error instanceof BrowseError ? error.code : 'BROWSE_DRIVER_ERROR', message: error instanceof BrowseError ? error.message : 'Driver request failed.', exitCode: error instanceof BrowseError ? error.exitCode : 2 });
    }
  });
  server.once('close', () => trace('server closed'));
  server.on('clientError', error => trace(`client error ${error.message}`));
  server.requestTimeout = 30_000; server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('BROWSE_RPC_BIND');
  let cleanup = setTimeout(() => { void close().catch(error => process.stderr.write(`${String(error)}\n`)); }, Math.max(1, Date.parse(binding.budget.deadline) - Date.now() + 120_000)); cleanup.unref();
  async function close() { trace('driver.close called'); clearTimeout(cleanup); await engine.close(); server.closeAllConnections(); if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  return { endpoint: `http://127.0.0.1:${address.port}/`, capability, challenge, pid: process.pid, close };
}
