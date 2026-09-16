import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeCards,
  toCents,
  fmtCents,
  parseEvaluateRequest,
  shapeEvaluation,
  failedGates
} from './benefits.js';

const item = (over = {}) => ({
  card_id: 'card1',
  card_product: 'Chase Sapphire Reserve',
  holder: 'Sam',
  state: 'available',
  ...over
});

test('dedupeCards collapses per card and counts available instances', () => {
  const cards = dedupeCards([
    item(),
    item({ state: 'consumed' }),
    item(),
    item({ card_id: 'card2', card_product: 'Amex Platinum', state: 'available' })
  ]);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], { id: 'card1', product: 'Chase Sapphire Reserve', holder: 'Sam', available: 2 });
  assert.equal(cards[1].available, 1);
});

test('dedupeCards sorts most-available first, then by product', () => {
  const cards = dedupeCards([
    item({ card_id: 'b', card_product: 'B Card' }),
    item({ card_id: 'a', card_product: 'A Card' }),
    item({ card_id: 'c', card_product: 'C Card' }),
    item({ card_id: 'c', card_product: 'C Card' })
  ]);
  assert.deepEqual(cards.map((c) => c.id), ['c', 'a', 'b']);
});

test('dedupeCards tolerates junk rows', () => {
  assert.deepEqual(dedupeCards(/** @type {any} */ (undefined)), []);
  assert.deepEqual(dedupeCards([{}, null, { state: 'available' }]), []);
});

test('toCents parses typed amounts, keeps empty/garbage apart', () => {
  assert.equal(toCents('610'), 61000);
  assert.equal(toCents('$610.50'), 61050);
  assert.equal(toCents('1,234'), 123400);
  assert.equal(toCents(610.5), 61050);
  assert.equal(toCents(''), null);
  assert.equal(toCents('  '), null);
  assert.equal(toCents(null), null);
  assert.equal(toCents('abc'), undefined);
  assert.equal(toCents('12.345'), undefined);
  assert.equal(toCents('-5'), undefined);
});

test('fmtCents renders whole dollars without decimals', () => {
  assert.equal(fmtCents(30000), '$300');
  assert.equal(fmtCents(61050), '$610.50');
  assert.equal(fmtCents(1234, 'EUR'), '12.34 EUR');
  assert.equal(fmtCents(null), '');
});

const goodReq = () => ({
  check_in: '2026-10-02',
  check_out: '2026-10-04',
  paying_card_id: 'mv65jh3nob8an3c',
  channel: 'The Edit via Chase Travel (chasetravel.com)',
  prepaid: true,
  cash_quote: '610'
});

test('parseEvaluateRequest builds the v1 payload with cents + pinned category', () => {
  const res = parseEvaluateRequest(goodReq());
  assert.equal(res.ok, true);
  assert.deepEqual(res.payload, {
    check_in: '2026-10-02',
    check_out: '2026-10-04',
    paying_card_id: 'mv65jh3nob8an3c',
    prepaid: true,
    category: 'hotel',
    channel: 'The Edit via Chase Travel (chasetravel.com)',
    cash_quote_cents: 61000
  });
});

test('parseEvaluateRequest: empty channel = booked direct, omitted from payload', () => {
  const res = parseEvaluateRequest({ ...goodReq(), channel: '  ' });
  assert.equal(res.ok, true);
  assert.equal('channel' in res.payload, false);
});

test('parseEvaluateRequest: quote is optional, garbage quote rejected', () => {
  const noQuote = parseEvaluateRequest({ ...goodReq(), cash_quote: '' });
  assert.equal(noQuote.ok, true);
  assert.equal('cash_quote_cents' in noQuote.payload, false);
  assert.equal(parseEvaluateRequest({ ...goodReq(), cash_quote: 'six hundred' }).ok, false);
  assert.equal(parseEvaluateRequest({ ...goodReq(), cash_quote: '0' }).ok, false);
});

test('parseEvaluateRequest rejects bad dates and card ids', () => {
  assert.equal(parseEvaluateRequest({ ...goodReq(), check_in: '10/02/2026' }).ok, false);
  assert.equal(parseEvaluateRequest({ ...goodReq(), check_out: '2026-10-02' }).ok, false);
  assert.equal(parseEvaluateRequest({ ...goodReq(), paying_card_id: '' }).ok, false);
  assert.equal(parseEvaluateRequest({ ...goodReq(), paying_card_id: 'a b' }).ok, false);
});

test('parseEvaluateRequest coerces prepaid to a real boolean', () => {
  const res = parseEvaluateRequest({ ...goodReq(), prepaid: 'yes' });
  assert.equal(res.ok, true);
  assert.equal(res.payload.prepaid, false);
});

// Trimmed from a real v1 response (captured 2026-09-16).
const rawEval = {
  nights: 2,
  statement: [
    {
      instance_id: 'hv56jpax3j1d7tr',
      rule_name: 'CSR $300 Annual Travel Credit',
      credit_type: 'statement',
      card_id: 'mv65jh3nob8an3c',
      card_product: 'Chase Sapphire Reserve',
      holder: 'Sam',
      amount_cents: 30000,
      currency: 'USD',
      gates: [{ key: 'channel', label: 'Booking channel', pass: true, detail: 'any channel qualifies' }]
    }
  ],
  statement_value_cents: 30000,
  on_property: [],
  on_property_value_cents: 0,
  conflicts: [],
  blocked: [
    {
      instance_id: '8vknblafmt42dvn',
      rule_name: 'CSR The Edit $100 Property Credit',
      credit_type: 'on_property',
      card_product: 'Chase Sapphire Reserve',
      holder: 'Sam',
      amount_cents: 10000,
      currency: 'USD',
      gates: [
        { key: 'channel', label: 'Booking channel', pass: false, detail: 'requires The Edit via Chase Travel' },
        { key: 'nights', label: 'Minimum nights', pass: true, detail: '2 night(s) vs 1 required' }
      ]
    }
  ],
  fees: [
    {
      cardId: 'mv65jh3nob8an3c',
      label: 'Chase Sapphire Reserve (Sam)',
      annualFeeCents: 79500,
      currency: 'USD',
      renewsOn: '2027-05-20',
      renewalInDays: 246
    }
  ],
  pricing: [{ kind: 'cash', label: 'Cash', equivalentCents: 61000, note: 'the quote itself', coverage: [], cheapest: true }]
};

test('shapeEvaluation normalizes the v1 response', () => {
  const ev = shapeEvaluation(rawEval);
  assert.equal(ev.nights, 2);
  assert.equal(ev.statement.length, 1);
  assert.equal(ev.statement[0].ruleName, 'CSR $300 Annual Travel Credit');
  assert.equal(ev.statement[0].gates[0].pass, true);
  assert.equal(ev.totalValueCents, 30000);
  assert.equal(ev.blocked[0].creditType, 'on_property');
  assert.equal(ev.fees[0].annualFeeCents, 79500);
  assert.equal(ev.fees[0].renewalInDays, 246);
  assert.equal(ev.pricing[0].cheapest, true);
});

test('shapeEvaluation tolerates a sparse response', () => {
  const ev = shapeEvaluation({ nights: 1 });
  assert.equal(ev.nights, 1);
  assert.deepEqual(ev.statement, []);
  assert.deepEqual(ev.blocked, []);
  assert.equal(ev.totalValueCents, 0);
});

test('failedGates picks out only the failing gates', () => {
  const ev = shapeEvaluation(rawEval);
  const failed = failedGates(ev.blocked[0]);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].key, 'channel');
});
