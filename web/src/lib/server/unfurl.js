// Server-side link unfurl: fetch a user-supplied URL, parse its <head> for
// OpenGraph metadata, and return { image, title, description }. Used to give a
// location idea a rich preview from its link. Free, self-hosted, no third party.
//
// ⚠️ SSRF surface — this fetches arbitrary user-controlled URLs from inside our
// network. We guard hard:
//   - only http(s)
//   - resolve the host via DNS and REJECT any address in a private / loopback /
//     link-local / CGNAT / metadata / reserved range (IPv4 and IPv6)
//   - follow at most MAX_REDIRECTS hops, re-validating the host of every hop
//   - ~5s total timeout, ~1.5 MB body cap, parse only — never execute
// The og:image we return is a URL string the BROWSER loads directly; we never
// fetch the image bytes ourselves, so it isn't a second SSRF vector here.

import dns from 'node:dns/promises';
import net from 'node:net';

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

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

/** @param {string} ip */
function isBlockedIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedV4(ip);
  if (fam === 6) return isBlockedV6(ip);
  return true; // not an IP literal → unsafe
}

/**
 * Validate a URL string and confirm every resolved address is public. Exported
 * so the SSRF guard can be unit-tested in isolation; throws on anything unsafe.
 * @param {string} raw
 * @returns {Promise<URL>} the parsed URL (throws if unsafe)
 */
export async function assertSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (_) {
    throw new Error('bad url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad scheme');
  // Node keeps the brackets on an IPv6 hostname ("[::1]"); strip them so net.isIP
  // classifies the literal instead of falling through to a (failing) DNS lookup.
  const host = u.hostname.replace(/^\[|\]$/g, '');
  // Literal IP in the URL — check directly, no DNS.
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('blocked host');
    return u;
  }
  // Hostname → resolve and reject if ANY address is private.
  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch (_) {
    throw new Error('dns failure');
  }
  if (!records.length) throw new Error('no address');
  for (const r of records) {
    if (isBlockedIp(r.address)) throw new Error('blocked host');
  }
  return u;
}

/** Read a response body up to MAX_BYTES, then stop. */
async function readCapped(/** @type {Response} */ res) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  const decoder = new TextDecoder('utf-8');
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    chunks.push(value);
    // OG tags live in <head>; bail as soon as we've seen </head> or hit the cap.
    if (total >= MAX_BYTES || /<\/head>/i.test(out)) {
      try {
        await reader.cancel();
      } catch (_) {
        /* ignore */
      }
      break;
    }
  }
  out += decoder.decode();
  return out;
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
    let finalUrl = await assertSafeUrl(current);
    let res;
    // Follow redirects ourselves so we can re-validate each hop's host.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      finalUrl = await assertSafeUrl(current);
      res = await fetch(finalUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Many sites only emit OG tags to a "real" browser/crawler UA.
          'user-agent': 'Mozilla/5.0 (compatible; tripwala-link-preview/1.0; +https://tripwala.enzoiwith.us)',
          accept: 'text/html,application/xhtml+xml'
        }
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop === MAX_REDIRECTS) return null; // too many hops
        current = new URL(res.headers.get('location') ?? '', finalUrl).toString();
        continue;
      }
      break;
    }
    if (!res || !res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    if (ctype && !/text\/html|application\/xhtml/i.test(ctype)) return null;

    const html = await readCapped(res);
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
    const title = metaContent(html, 'og:title') || (titleTag ? decodeEntities(titleTag[1].trim()) : '');
    const description =
      metaContent(html, 'og:description') || metaContent(html, 'description') || metaContent(html, 'twitter:description');

    // Resolve a relative og:image against the final URL; re-validate, since it's
    // a remote URL we'll hand to the browser (don't ship internal hosts to it).
    let absImage = '';
    if (image) {
      try {
        const iu = new URL(image, finalUrl);
        if ((iu.protocol === 'http:' || iu.protocol === 'https:') && !net.isIP(iu.hostname)) absImage = iu.toString();
        else if ((iu.protocol === 'http:' || iu.protocol === 'https:') && !isBlockedIp(iu.hostname)) absImage = iu.toString();
      } catch (_) {
        /* drop a malformed image url */
      }
    }

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
