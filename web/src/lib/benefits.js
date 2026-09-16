// Benefit-aware hotel planning (moneywala charter step 7). Pure, client-safe
// shaping for the "check card benefits" panel on stay bookings: card-picker
// dedupe, evaluate-request validation, and the v1 evaluate-booking response →
// view model. The actual moneywala calls live in $lib/server/moneywala.js
// (server-only — the service token never reaches the browser); this module has
// no env or fetch so the classifiers stay unit-testable under `node --test`.

// NOTE on channels: there is NO canonical channel enum. A rule's
// booking_channel is household free text; the gate is an exact string match
// after trim+lowercase, and an empty rule channel means any channel passes
// (per the moneywala agent, 2026-09-16). Consumers must send a value VERBATIM
// from GET /channels — the picker is discovery-driven, never hardcoded — and
// an empty channel is the correct way to say "booked direct / somewhere no
// credit cares about".

/**
 * @typedef {Object} BenefitCard
 * @property {string} id        moneywala card id (paying_card_id for evaluate)
 * @property {string} product   e.g. "Chase Sapphire Reserve"
 * @property {string} holder    e.g. "Sam"
 * @property {number} available count of currently-available benefit instances
 */

/**
 * Collapse GET /benefits items into one row per card for the paying-card
 * picker, most live benefits first.
 * @param {Array<any>} items
 * @returns {BenefitCard[]}
 */
export function dedupeCards(items) {
  /** @type {Map<string, BenefitCard>} */
  const byId = new Map();
  for (const it of items ?? []) {
    if (!it?.card_id) continue;
    const prev = byId.get(it.card_id);
    const row = prev ?? { id: it.card_id, product: it.card_product || 'Card', holder: it.holder || '', available: 0 };
    byId.set(it.card_id, {
      ...row,
      available: row.available + (it.state === 'available' ? 1 : 0)
    });
  }
  return [...byId.values()].sort(
    (a, b) => b.available - a.available || a.product.localeCompare(b.product)
  );
}

/**
 * Parse a user-typed money amount ("610", "$610.50", "1,234") → integer cents.
 * Returns null for empty, undefined for garbage — so callers can tell "no
 * quote" (fine, pricing is optional) from "typo" (reject).
 * @param {unknown} input
 * @returns {number | null | undefined}
 */
export function toCents(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  return Math.round(Number(s) * 100);
}

/**
 * Format integer cents for display. Whole dollars drop the decimals.
 * @param {number | null | undefined} cents
 * @param {string} [currency]
 */
export function fmtCents(cents, currency = 'USD') {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '';
  const n = Number(cents) / 100;
  const body = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return currency === 'USD' || currency === '' ? `$${body}` : `${body} ${currency}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validate the browser's evaluate form into the exact v1 request body, or say
 * why not. Category is pinned to `hotel` — this panel is the stay surface.
 * @param {any} body
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parseEvaluateRequest(body) {
  const checkIn = String(body?.check_in ?? '').trim();
  const checkOut = String(body?.check_out ?? '').trim();
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) {
    return { ok: false, error: 'Check-in and check-out dates are required (YYYY-MM-DD).' };
  }
  if (checkOut <= checkIn) return { ok: false, error: 'Check-out must be after check-in.' };

  const cardId = String(body?.paying_card_id ?? '').trim();
  if (!ID_RE.test(cardId)) return { ok: false, error: 'Pick which card pays.' };

  // Verbatim from GET /channels; empty = booked direct (only ever passes
  // rules whose channel gate is empty, which is the intended semantics).
  const channel = String(body?.channel ?? '').trim().slice(0, 200);

  /** @type {Record<string, unknown>} */
  const payload = {
    check_in: checkIn,
    check_out: checkOut,
    paying_card_id: cardId,
    prepaid: body?.prepaid === true || body?.prepaid === 'true',
    category: 'hotel'
  };
  if (channel) payload.channel = channel;

  const quote = toCents(body?.cash_quote);
  if (quote === undefined) return { ok: false, error: 'The cash quote doesn’t look like an amount.' };
  if (quote !== null) {
    if (quote <= 0) return { ok: false, error: 'The cash quote doesn’t look like an amount.' };
    payload.cash_quote_cents = quote;
  }
  return { ok: true, payload };
}

/**
 * @typedef {Object} ShapedCredit
 * @property {string} id
 * @property {string} ruleName
 * @property {'statement' | 'on_property' | string} creditType
 * @property {string} cardProduct
 * @property {string} holder
 * @property {number} amountCents
 * @property {string} currency
 * @property {Array<{ key: string, label: string, pass: boolean, detail: string }>} gates
 */

/** @param {any} c @returns {ShapedCredit} */
function shapeCredit(c) {
  return {
    id: String(c?.instance_id ?? ''),
    ruleName: String(c?.rule_name ?? ''),
    creditType: String(c?.credit_type ?? 'statement'),
    cardProduct: String(c?.card_product ?? ''),
    holder: String(c?.holder ?? ''),
    amountCents: Number(c?.amount_cents) || 0,
    currency: String(c?.currency ?? 'USD'),
    gates: (Array.isArray(c?.gates) ? c.gates : []).map((/** @type {any} */ g) => ({
      key: String(g?.key ?? ''),
      label: String(g?.label ?? ''),
      pass: !!g?.pass,
      detail: String(g?.detail ?? '')
    }))
  };
}

/** The gates a credit failed — why it's blocked. @param {ShapedCredit} credit */
export function failedGates(credit) {
  return credit.gates.filter((g) => !g.pass);
}

/**
 * Normalize the v1 evaluate-booking response into the panel's view model.
 * Tolerant of missing arrays so a partial/older response still renders.
 * @param {any} raw
 */
export function shapeEvaluation(raw) {
  const list = (/** @type {any} */ v) => (Array.isArray(v) ? v : []);
  const statementValueCents = Number(raw?.statement_value_cents) || 0;
  const onPropertyValueCents = Number(raw?.on_property_value_cents) || 0;
  return {
    nights: Number(raw?.nights) || 0,
    statement: list(raw?.statement).map(shapeCredit),
    onProperty: list(raw?.on_property).map(shapeCredit),
    conflicts: list(raw?.conflicts).map(shapeCredit),
    blocked: list(raw?.blocked).map(shapeCredit),
    statementValueCents,
    onPropertyValueCents,
    totalValueCents: statementValueCents + onPropertyValueCents,
    fees: list(raw?.fees).map((f) => ({
      label: String(f?.label ?? ''),
      annualFeeCents: Number(f?.annualFeeCents) || 0,
      currency: String(f?.currency ?? 'USD'),
      renewsOn: String(f?.renewsOn ?? ''),
      renewalInDays: Number.isFinite(Number(f?.renewalInDays)) ? Number(f.renewalInDays) : null
    })),
    pricing: list(raw?.pricing).map((p) => ({
      kind: String(p?.kind ?? ''),
      label: String(p?.label ?? ''),
      equivalentCents: Number(p?.equivalentCents) || 0,
      note: String(p?.note ?? ''),
      cheapest: !!p?.cheapest
    }))
  };
}
