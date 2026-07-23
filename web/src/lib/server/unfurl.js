// Server-side link unfurl: fetch a user-supplied URL, parse its <head> for
// OpenGraph metadata, and return { image, title, description }. Used to give a
// location idea a rich preview from its link. Free, self-hosted, no third party.
//
// ⚠️ SSRF surface — this fetches arbitrary user-controlled URLs from inside our
// network. We guard hard:
//   - only http(s)
//   - a custom DNS `lookup` validates EVERY resolved address against private /
//     loopback / link-local / CGNAT / metadata / reserved ranges (IPv4 + IPv6)
//     AT CONNECTION TIME — the socket only ever connects to an address we just
//     checked, so there's no DNS-rebinding (TOCTOU) window between check and
//     connect. SNI/Host still use the original hostname, so TLS verifies normally.
//   - follow at most MAX_REDIRECTS hops, re-checking scheme + host each hop
//   - ~5s total timeout, ~1.5 MB body cap, parse only — never execute
// The og:image we return is a URL string the BROWSER loads directly; we never
// fetch the image bytes ourselves, so it isn't a second SSRF vector here.

import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
// A real desktop-browser UA — many outdoor sites (AllTrails, etc.) only emit OG
// tags to a browser-looking client and 403 an obvious bot UA. We still don't run
// JS or request compression, so this is just "look like a browser fetching HTML".
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Parse an IPv4 string to its 32-bit integer, or null. */
function ipv4ToInt(/** @type {string} */ ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255 || !/^\d+$/.test(p)) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

/** True if an IPv4 address sits in a range we must never reach. */
function isBlockedV4(/** @type {string} */ ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as unsafe
  /** @param {string} cidr @returns {boolean} */
  const inCidr = (cidr) => {
    const [base, bitsStr] = cidr.split('/');
    const bits = Number(bitsStr);
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (baseInt & mask);
  };
  return [
    '0.0.0.0/8', // "this" network
    '10.0.0.0/8', // private
    '100.64.0.0/10', // CGNAT
    '127.0.0.0/8', // loopback
    '169.254.0.0/16', // link-local (incl. 169.254.169.254 cloud metadata)
    '172.16.0.0/12', // private
    '192.0.0.0/24', // IETF protocol assignments
    '192.0.2.0/24', // TEST-NET-1
    '192.168.0.0/16', // private
    '198.18.0.0/15', // benchmarking
    '198.51.100.0/24', // TEST-NET-2
    '203.0.113.0/24', // TEST-NET-3
    '224.0.0.0/4', // multicast
    '240.0.0.0/4' // reserved (incl. 255.255.255.255)
  ].some(inCidr);
}

/** True if an IPv6 address sits in a range we must never reach. */
function isBlockedV6(/** @type {string} */ ip) {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible → judge the embedded v4.
  const mapped = lower.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb'))
    return true; // fe80::/10 link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique-local
  if (lower.startsWith('ff')) return true; // ff00::/8 multicast
  return false;
}

/**
 * True if an address must never be reached. The pure, DNS-free core of the SSRF
 * guard — exported so it can be exhaustively unit-tested (see unfurl.test.js).
 * Anything that isn't a public IPv4/IPv6 literal (including hostnames) is unsafe.
 * @param {string} ip
 */
export function isBlockedIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedV4(ip);
  if (fam === 6) return isBlockedV6(ip);
  return true; // not an IP literal → unsafe
}

/**
 * A `dns.lookup`-compatible function that resolves a hostname and rejects if ANY
 * resolved address is non-public. Used as the `lookup` option on the http(s)
 * request so the socket connects ONLY to addresses we validated in the same
 * call — this is what closes the DNS-rebinding window.
 * @param {string} hostname
 * @param {any} options
 * @param {(err: Error|null, address?: any, family?: number) => void} callback
 */
function guardedLookup(hostname, options, callback) {
  // Node may call lookup(hostname, callback) with options omitted.
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length) return callback(new Error('no address'));
    // Reject outright if any address resolves into a forbidden range.
    for (const a of list) {
      if (isBlockedIp(a.address)) return callback(new Error('blocked host'));
    }
    // Honor a requested family (happy-eyeballs / autoSelectFamily) when set.
    const wantFam = options && (options.family === 4 || options.family === 6) ? options.family : 0;
    const picked = wantFam ? list.filter((a) => a.family === wantFam) : list;
    if (!picked.length) return callback(new Error('no address'));
    if (options && options.all) return callback(null, picked);
    callback(null, picked[0].address, picked[0].family);
  });
}

/**
 * Validate a URL's scheme and any literal-IP host. Hostnames are NOT resolved
 * here — guardedLookup validates them at connection time. Throws on anything
 * unsafe; returns the parsed URL otherwise.
 * @param {string} raw
 * @returns {URL}
 */
function assertSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (_) {
    throw new Error('bad url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad scheme');
  // Node keeps brackets on an IPv6 hostname ("[::1]"); strip so net.isIP matches.
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedIp(host)) throw new Error('blocked host');
  return u;
}

/**
 * Issue one GET with the SSRF-guarded lookup and return the live response stream.
 * @param {URL} u
 * @param {AbortSignal} signal
 * @returns {Promise<import('node:http').IncomingMessage>}
 */
function requestOnce(u, signal) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method: 'GET',
        lookup: guardedLookup,
        signal,
        headers: {
          // Look like a real browser fetching HTML — many sites gate OG tags on
          // this. No accept-encoding: we don't decompress, so we want identity.
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9'
        }
      },
      (res) => resolve(res)
    );
    req.on('error', reject);
    req.end();
  });
}

/** Read a response stream up to MAX_BYTES (or past </head>), then stop. */
function readCapped(/** @type {import('node:http').IncomingMessage} */ res) {
  return new Promise((resolve, reject) => {
    let out = '';
    let total = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(out);
    };
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      total += Buffer.byteLength(chunk);
      out += chunk;
      // OG tags live in <head>; bail as soon as we've seen </head> or hit the cap.
      if (total >= MAX_BYTES || /<\/head>/i.test(out)) {
        res.destroy();
        finish();
      }
    });
    res.on('end', finish);
    res.on('close', finish);
    res.on('error', (e) => (settled ? null : ((settled = true), reject(e))));
  });
}

/** Pull a single <meta property|name="key" content="..."> value from HTML. */
function metaContent(/** @type {string} */ html, /** @type {string} */ key) {
  // property/name in either order; content in either order; quotes either kind.
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return '';
}

/** Minimal HTML-entity decode for the handful that show up in OG text. */
function decodeEntities(/** @type {string} */ s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** A remote og:image URL is safe to STORE (the browser loads it) if it's http(s)
 *  and not an internal IP literal. Resolves relatives against the page URL. */
function safeImageUrl(/** @type {string} */ image, /** @type {URL} */ base) {
  if (!image) return '';
  try {
    const iu = new URL(image, base);
    if (iu.protocol !== 'http:' && iu.protocol !== 'https:') return '';
    const host = iu.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isBlockedIp(host)) return ''; // never store an internal host
    return iu.toString();
  } catch (_) {
    return '';
  }
}

/**
 * Unfurl a URL into preview metadata. Best-effort: returns null on any failure
 * (bad/unsafe URL, timeout, no OG tags). Callers should mark "fetched" regardless
 * so we don't retry a site that simply has no metadata.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ image: string, title: string, description: string } | null>}
 */
export async function unfurl(rawUrl) {
  if (!rawUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = rawUrl;
    let finalUrl = assertSafeUrl(current);
    /** @type {import('node:http').IncomingMessage | undefined} */
    let res;
    // Follow redirects ourselves so we can re-check scheme + host on every hop.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      finalUrl = assertSafeUrl(current);
      res = await requestOnce(finalUrl, controller.signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume(); // drain the redirect body so the socket frees up
        if (hop === MAX_REDIRECTS) return null; // too many hops
        current = new URL(location, finalUrl).toString();
        continue;
      }
      break;
    }
    if (!res) return null;
    const status = res.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      res.resume();
      return null;
    }
    const ctype = String(res.headers['content-type'] || '');
    if (ctype && !/text\/html|application\/xhtml/i.test(ctype)) {
      res.resume();
      return null;
    }

    const html = await readCapped(res);
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
    const title = metaContent(html, 'og:title') || (titleTag ? decodeEntities(titleTag[1].trim()) : '');
    const description =
      metaContent(html, 'og:description') || metaContent(html, 'description') || metaContent(html, 'twitter:description');

    const absImage = safeImageUrl(image, finalUrl);
    if (!absImage && !title && !description) return null;
    return {
      image: absImage.slice(0, 1000),
      title: title.slice(0, 300),
      description: description.slice(0, 600)
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
