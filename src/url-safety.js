import { lookup } from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.0.0.0', '192.0.0.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['198.18.0.0', '198.19.255.255'],
  ['224.0.0.0', '255.255.255.255'],
];

function ipv4ToNumber(ip) {
  return ip.split('.').reduce((value, part) => ((value << 8) + Number(part)) >>> 0, 0);
}

export function isBlockedIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const numeric = ipv4ToNumber(address);
    return BLOCKED_IPV4_RANGES.some(([start, end]) => (
      numeric >= ipv4ToNumber(start) && numeric <= ipv4ToNumber(end)
    ));
  }

  if (version === 6) {
    const value = address.toLowerCase();
    return value === '::'
      || value === '::1'
      || value.startsWith('fc')
      || value.startsWith('fd')
      || value.startsWith('fe80:')
      || value.startsWith('::ffff:');
  }

  return true;
}

export function normalizePublicUrl(value) {
  const input = String(value || '').trim();
  if (!input) throw new Error('A public URL is required.');

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs can be checked.');
  }
  if (url.username || url.password) {
    throw new Error('URLs containing credentials are not supported.');
  }

  url.hash = '';
  return url.toString();
}

export async function assertPublicUrl(value, lookupFn = lookup) {
  const normalized = normalizePublicUrl(value);
  const url = new URL(normalized);
  const hostname = url.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local and private hostnames are not supported.');
  }

  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new Error('The URL resolves to a private or blocked network address.');
  }

  const records = await lookupFn(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isBlockedIp(record.address))) {
    throw new Error('The URL resolves to a private or blocked network address.');
  }

  return normalized;
}
