import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

type LookupAddress = Readonly<{ address: string; family: number }>;
export type PublicHostLookup = (hostname: string) => Promise<readonly LookupAddress[]>;

const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64], ['2001::', 23],
  ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
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

export async function assertPublicNetworkUrl(value: string, lookup: PublicHostLookup = systemLookup): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || forbiddenPublicHostname(url.hostname)) throw new Error('public HTTPS destination required');
  const addresses = await lookup(url.hostname);
  if (!addresses.length || addresses.some(({ address, family }) => family !== isIP(address) || !publicIpAddress(address))) {
    throw new Error('destination resolves to a non-public network');
  }
}
