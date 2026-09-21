import { lookup as dnsLookup } from 'node:dns/promises';
import { createServer } from 'node:http';
import { BlockList, connect as netConnect, isIP } from 'node:net';
import type { Duplex } from 'node:stream';

type LookupAddress = Readonly<{ address: string; family: number }>;
export type PublicHostLookup = (hostname: string) => Promise<readonly LookupAddress[]>;
type PublicTcpConnect = (address: string, port: number, family: 4 | 6) => Duplex;
export type PublicNetworkProxy = Readonly<{ server: string; close(): Promise<void> }>;

const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48],
  ['100::', 64], ['100:0:0:1::', 64], ['2001::', 23],
  ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20], ['5f00::', 16],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blockedV6.addSubnet(network, prefix, 'ipv6');

const FORBIDDEN_HOST_SUFFIXES = [
  'localhost', 'local', 'localdomain', 'home', 'lan', 'internal',
  'nip.io', 'sslip.io', 'xip.io', 'localtest.me', 'lvh.me', 'vcap.me',
] as const;

export function forbiddenPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return isIP(normalized) !== 0 || FORBIDDEN_HOST_SUFFIXES.some(suffix =>
    normalized === suffix || normalized.endsWith(`.${suffix}`));
}

export function publicIpAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blockedV4.check(address, 'ipv4')
    : family === 6 && !blockedV6.check(address, 'ipv6');
}

const systemLookup: PublicHostLookup = hostname => dnsLookup(hostname, { all: true, verbatim: true });
const systemConnect: PublicTcpConnect = (address, port, family) => netConnect({ host: address, port, family });

export async function resolvePublicDestination(
  hostname: string,
  lookup: PublicHostLookup = systemLookup,
): Promise<Readonly<{ address: string; family: 4 | 6 }>> {
  if (forbiddenPublicHostname(hostname)) throw new Error('public HTTPS destination required');
  const addresses = await lookup(hostname);
  if (!addresses.length || addresses.some(({ address, family }) => family !== isIP(address) || !publicIpAddress(address))) {
    throw new Error('destination resolves to a non-public network');
  }
  const selected = addresses[0]!;
  return Object.freeze({ address: selected.address, family: selected.family as 4 | 6 });
}

export async function assertPublicNetworkUrl(value: string, lookup: PublicHostLookup = systemLookup): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('public HTTPS destination required');
  await resolvePublicDestination(url.hostname, lookup);
}

function target(authority: string | undefined): Readonly<{ hostname: string; port: number }> {
  if (authority === undefined || !authority.endsWith(':443')) throw new Error('CONNECT target required');
  const url = new URL(`https://${authority}`);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('only canonical HTTPS CONNECT targets are allowed');
  }
  return Object.freeze({ hostname: url.hostname, port: 443 });
}

export async function createPublicNetworkProxy(options: Readonly<{
  lookup?: PublicHostLookup;
  connect?: PublicTcpConnect;
}> = {}): Promise<PublicNetworkProxy> {
  const lookup = options.lookup ?? systemLookup;
  const connect = options.connect ?? systemConnect;
  const sockets = new Set<Duplex>();
  const server = createServer((_request, response) => {
    response.writeHead(403, { connection: 'close' });
    response.end();
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', (request, client, head) => {
    let clientClosed = client.destroyed;
    let upstream: Duplex | undefined;
    const closeUpstream = () => { clientClosed = true; upstream?.destroy(); };
    client.once('end', closeUpstream);
    client.once('close', closeUpstream);
    void (async () => {
      try {
        const destination = target(request.url);
        const resolved = await resolvePublicDestination(destination.hostname, lookup);
        if (clientClosed || client.destroyed) return;
        const connected = connect(resolved.address, destination.port, resolved.family);
        upstream = connected;
        sockets.add(connected);
        connected.once('close', () => sockets.delete(connected));
        connected.once('error', () => client.destroy());
        connected.once('connect', () => {
          if (clientClosed || client.destroyed) { connected.destroy(); return; }
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) connected.write(head);
          client.pipe(connected);
          connected.pipe(client);
        });
      } catch {
        client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('public network proxy failed to bind');
  return Object.freeze({
    server: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  });
}
