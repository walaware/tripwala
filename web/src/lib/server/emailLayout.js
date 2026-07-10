// The one tripwala email shell. Every message the app sends renders through
// `renderEmail`, so they all look like the app and only differ in content.
//
// Email clients are not browsers: no external stylesheets, no CSS custom
// properties, patchy flexbox, and Outlook ignores padding on <a>. So this is
// table-based markup with inline styles and literal hex values — the same
// palette @walaware/design exposes as CSS variables, copied here because an
// email can't read them. Keep the two in sync when the brand changes.

/** Brand palette (mirrors @walaware/design theme.css). */
const C = {
  sand100: '#fff4ea',
  sand300: '#ffe0c2',
  coral500: '#ff7a59',
  coral600: '#e15b38',
  cocoa900: '#3a2d28',
  cocoa700: '#6b5247',
  cocoa500: '#9a8a80',
  white: '#ffffff'
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escape untrusted text for HTML interpolation. @param {unknown} s */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Render a branded tripwala email.
 *
 * Callers pass PLAIN TEXT for every field except `bodyHtml`; this function
 * escapes them. `bodyHtml` is trusted markup the caller assembles — never
 * interpolate user input into it without `esc()`.
 *
 * @param {Object} o
 * @param {string} o.eyebrow      small uppercase kicker, e.g. "You're invited 🎒"
 * @param {string} o.title        the headline (a trip name, usually)
 * @param {string} o.bodyHtml     one or two sentences of trusted HTML
 * @param {string} [o.ctaLabel]   button text; omit to render no button
 * @param {string} [o.ctaUrl]     button target; required when ctaLabel is set
 * @param {string} [o.preheader]  inbox preview line; falls back to the title
 * @returns {string} a complete HTML document
 */
export function renderEmail({ eyebrow, title, bodyHtml, ctaLabel, ctaUrl, preheader }) {
  const button =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding-top:20px">
          <a href="${esc(ctaUrl)}" style="display:inline-block;background:${C.coral500};color:${C.white};font-weight:700;font-size:16px;text-decoration:none;padding:13px 26px;border-radius:999px">${esc(ctaLabel)} →</a>
        </td></tr>
        <tr><td style="font-size:12px;font-weight:600;color:${C.cocoa500};padding-top:18px">
          Or paste this link in your browser:<br><span style="color:${C.cocoa700}">${esc(ctaUrl)}</span>
        </td></tr>`
      : '';

  // The hidden preheader controls the grey preview text next to the subject.
  return `<!doctype html>
<html><body style="margin:0;background:${C.sand100};padding:24px;font-family:${FONT};color:${C.cocoa900}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:${C.white};border-radius:16px;padding:28px;border:1px solid ${C.sand300}" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${C.coral600}">${esc(eyebrow)}</td></tr>
      <tr><td style="font-size:24px;font-weight:800;padding-top:6px;line-height:1.25">${esc(title)}</td></tr>
      <tr><td style="font-size:15px;font-weight:600;color:${C.cocoa700};padding-top:8px;line-height:1.5">${bodyHtml}</td></tr>
      ${button}
    </table>
    <div style="font-size:12px;font-weight:700;color:${C.cocoa500};padding-top:14px">tripwala — one link, everyone's in.</div>
  </td></tr></table>
</body></html>`;
}
