import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePage, pageResponseHeaders, shapePages, PAGE_HTML_MAX } from './pages.js';

test('validatePage accepts a titled page and trims the title', () => {
  const r = validatePage({ title: '  Costumes 🎭  ', html: '<!doctype html><h1>hi</h1>' });
  assert.equal(r.ok, true);
  assert.equal(r.title, 'Costumes 🎭');
});

test('validatePage rejects missing title, empty html, oversize html', () => {
  assert.equal(validatePage({ title: '', html: '<p>x</p>' }).ok, false);
  assert.equal(validatePage({ title: 'T', html: '   ' }).ok, false);
  assert.equal(validatePage({ title: 'T', html: 'x'.repeat(PAGE_HTML_MAX + 1) }).ok, false);
});

test('page headers sandbox WITHOUT allow-same-origin — the load-bearing bit', () => {
  const h = pageResponseHeaders();
  assert.match(h['content-security-policy'], /\bsandbox\b/);
  assert.doesNotMatch(h['content-security-policy'], /allow-same-origin/);
  assert.match(h['content-type'], /text\/html/);
  assert.equal(h['cache-control'], 'private, no-store');
});

test('shapePages strips the html and sorts by title', () => {
  const pages = shapePages([
    { id: 'b', title: 'Zeta', html: '<p>never shipped</p>', added_by: 'p1', updated: '2026-10-12 10:00:00.000Z' },
    { id: 'a', title: 'Alpha', html: '<p>never shipped</p>', added_by: '', updated: '' }
  ]);
  assert.deepEqual(pages.map((p) => p.title), ['Alpha', 'Zeta']);
  assert.equal('html' in pages[0], false);
  assert.equal(pages[1].addedBy, 'p1');
  assert.equal(pages[1].updated, '2026-10-12');
});
