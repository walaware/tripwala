// Client → server bridge for planning-phase mutations. Mirrors tripClient: the
// browser POSTs an op to /[share_token]/plan, which writes server-side with
// membership + trip-scoped validation. Throws on failure so callers can reload.

/**
 * @param {string} shareToken
 * @param {Record<string, unknown>} body must include `op`
 */
export async function planAction(shareToken, body) {
  const res = await fetch(`/${encodeURIComponent(shareToken)}/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Planning action "${body.op}" failed (${res.status})`);
  return res.json();
}

/**
 * Multipart variant for ops that carry a file (e.g. set_location_image). Sends
 * the op + ids as form fields alongside the File; the /plan endpoint detects the
 * multipart content-type and routes it the same way as a JSON op.
 *
 * @param {string} shareToken
 * @param {Record<string, string>} fields must include `op` (and usually `ideaId`)
 * @param {File} file
 */
export async function planUpload(shareToken, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('image', file, file.name || 'photo');
  const res = await fetch(`/${encodeURIComponent(shareToken)}/plan`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Planning upload "${fields.op}" failed (${res.status})`);
  return res.json();
}
