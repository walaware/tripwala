// Provider detection + link validation for pasted photo albums.
//
// Run: `pnpm test`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoAlbum, parseAlbumLink } from './photoProviders.js';

test('photoAlbum: Google Photos links out, never framed', () => {
  for (const u of [
    'https://photos.google.com/share/AF1Qip123?key=abc',
    'https://photos.app.goo.gl/xYzAbc123'
  ]) {
    const a = photoAlbum(u);
    assert.equal(a?.provider, 'google');
    assert.equal(a?.embeddable, false);
    assert.equal(a?.label, 'Google Photos');
  }
});

test('photoAlbum: iCloud shared albums link out', () => {
  const a = photoAlbum('https://share.icloud.com/photos/0abCdEf');
  assert.equal(a?.provider, 'apple');
  assert.equal(a?.embeddable, false);
});

test('photoAlbum: unknown / self-hosted host is treated as Immich (framed)', () => {
  const a = photoAlbum('https://photos.example.com/share/abc123def456');
  assert.equal(a?.provider, 'immich');
  assert.equal(a?.embeddable, true);
});

test('photoAlbum: blank is null', () => {
  assert.equal(photoAlbum(''), null);
  assert.equal(photoAlbum(/** @type {any} */ (null)), null);
});

test('parseAlbumLink: accepts https provider links, trims trailing slash', () => {
  assert.equal(parseAlbumLink('https://photos.app.goo.gl/xYz/')?.url, 'https://photos.app.goo.gl/xYz');
  assert.equal(parseAlbumLink('  https://share.icloud.com/photos/abc  ')?.provider, 'apple');
});

test('parseAlbumLink: rejects non-URL and dangerous schemes', () => {
  assert.equal(parseAlbumLink('not a url'), null);
  assert.equal(parseAlbumLink('javascript:alert(1)'), null);
  assert.equal(parseAlbumLink('data:text/html,<b>x</b>'), null);
  assert.equal(parseAlbumLink(''), null);
});
