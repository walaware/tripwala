// Client → server bridge for trip mutations. The browser never talks to
// PocketBase directly; it POSTs an op to /[share_token]/actions, which performs
// the write server-side with trip-scoped validation. Throws on failure so
// callers can fall back to a reload.

/**
 * @param {string} shareToken
 * @param {Record<string, unknown>} body  must include `op`
 */
export async function tripAction(shareToken, body) {
  const res = await fetch(`/${encodeURIComponent(shareToken)}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    // Surface the server's error message (SvelteKit error() → { message }) so
    // callers can show why, e.g. an Immich album create that couldn't connect.
    let msg = `Trip action "${body.op}" failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) msg = data.message;
    } catch (_) {
      /* keep the generic message */
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Multipart variant for ops that carry a file (e.g. itin_item_image). Sends the
 * op + ids as form fields alongside the File; the /actions endpoint detects the
 * multipart content-type and routes it the same way as a JSON op. Mirrors
 * planUpload.
 *
 * @param {string} shareToken
 * @param {Record<string, string>} fields must include `op` (and usually `itemId`)
 * @param {File} file
 */
export async function tripUpload(shareToken, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('image', file, file.name || 'photo');
  const res = await fetch(`/${encodeURIComponent(shareToken)}/actions`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Trip upload "${fields.op}" failed (${res.status})`);
  return res.json();
}
