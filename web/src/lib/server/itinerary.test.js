// Unit tests for the itinerary shaping helper: item-level upvote tallies, the
// viewer's `mine`, fixed/flexible kind defaulting, and ordering (dated first,
// fixed-before-flexible within a day, undated last). Run with `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeItinerary } from './itinerary.js';

const names = { p1: 'Ana', p2: 'Bo', p3: 'Cy' };
const avatars = { p1: 'https://img/ana.png', p2: '', p3: '' };

test('tallies item-level upvotes and the viewer’s own vote', () => {
  const items = [{ id: 'i1', date: '2026-07-04 00:00:00.000Z', label: 'Beach day?', kind: 'flexible', sort_order: 0 }];
  const votes = [
    { itinerary_item: 'i1', participant: 'p1' },
    { itinerary_item: 'i1', participant: 'p2' }
  ];
  const [item] = shapeItinerary(items, votes, names, avatars, 'p1');
  assert.equal(item.votes, 2);
  assert.equal(item.mine, true);
  const [asBo] = shapeItinerary(items, votes, names, avatars, 'p3');
  assert.equal(asBo.mine, false);
});

test('defaults empty/legacy kind to flexible; keeps fixed', () => {
  const items = [
    { id: 'a', date: '2026-07-04 00:00:00.000Z', label: 'Check-in', kind: 'fixed', sort_order: 0 },
    { id: 'b', date: '2026-07-04 00:00:00.000Z', label: 'Legacy', sort_order: 1 }
  ];
  const map = Object.fromEntries(shapeItinerary(items, [], names, avatars, null).map((x) => [x.id, x.kind]));
  assert.equal(map.a, 'fixed');
  assert.equal(map.b, 'flexible');
});

test('keeps the question kind and passes group through (decision grouping)', () => {
  const items = [
    { id: 'q', date: '', label: 'Where to camp?', kind: 'question', sort_order: 0 },
    { id: 'o1', date: '', label: 'Fallen Leaf', kind: 'flexible', sort_order: 0, group: 'q' },
    { id: 'o2', date: '', label: 'Sunset', kind: 'flexible', sort_order: 1, group: 'q' }
  ];
  const map = Object.fromEntries(shapeItinerary(items, [], names, avatars, null).map((x) => [x.id, x]));
  assert.equal(map.q.kind, 'question');
  assert.equal(map.q.group, null);
  assert.equal(map.o1.kind, 'flexible');
  assert.equal(map.o1.group, 'q');
  assert.equal(map.o2.group, 'q');
});

test('group defaults to null for ungrouped items (back-compat)', () => {
  const items = [{ id: 'i1', date: '', label: 'Legacy', sort_order: 0 }];
  const [item] = shapeItinerary(items, [], names, avatars, null);
  assert.equal(item.group, null);
});

test('carries creator name + avatar', () => {
  const items = [{ id: 'i1', date: '', label: 'Movie?', kind: 'flexible', sort_order: 0, created_by: 'p1' }];
  const [item] = shapeItinerary(items, [], names, avatars, null);
  assert.equal(item.createdByName, 'Ana');
  assert.equal(item.createdByAvatar, 'https://img/ana.png');
});

test('carries place + note (empty when absent)', () => {
  const items = [
    { id: 'a', date: '', label: 'Olmsted Point', kind: 'fixed', sort_order: 0, place: 'Olmsted Point, Yosemite', note: 'The pullouts are the show.' },
    { id: 'b', date: '', label: 'No place', kind: 'flexible', sort_order: 1 }
  ];
  const shaped = shapeItinerary(items, [], names, avatars, null);
  const map = Object.fromEntries(shaped.map((x) => [x.id, x]));
  assert.equal(map.a.place, 'Olmsted Point, Yosemite');
  assert.equal(map.a.note, 'The pullouts are the show.');
  assert.equal(map.b.place, '');
  assert.equal(map.b.note, '');
});

test('orders: dated chronological, fixed-before-flexible per day, undated last', () => {
  const items = [
    { id: 'undated', date: '', label: 'Next year?', kind: 'flexible', sort_order: 0 },
    { id: 'd2', date: '2026-07-05 00:00:00.000Z', label: 'Hike', kind: 'flexible', sort_order: 0 },
    { id: 'flex', date: '2026-07-04 00:00:00.000Z', label: 'Beach?', kind: 'flexible', sort_order: 0 },
    { id: 'fixed', date: '2026-07-04 00:00:00.000Z', label: 'Check-in', kind: 'fixed', sort_order: 5 }
  ];
  const ids = shapeItinerary(items, [], names, avatars, null).map((x) => x.id);
  assert.deepEqual(ids, ['fixed', 'flex', 'd2', 'undated']);
});

test('ignores votes for deleted items and handles empty input', () => {
  assert.deepEqual(shapeItinerary([], [], names, avatars, 'p1'), []);
  const items = [{ id: 'i1', date: '', label: 'Q', kind: 'flexible', sort_order: 0 }];
  const [item] = shapeItinerary(items, [{ itinerary_item: 'gone', participant: 'p1' }], names, avatars, 'p1');
  assert.equal(item.votes, 0);
  assert.equal(item.mine, false);
});

test('shapes rich media: link, cached preview, and a thumbed image URL', () => {
  const items = [
    {
      id: 'i1',
      date: '',
      label: 'Where do we eat tonight?',
      kind: 'flexible',
      sort_order: 0,
      url: 'https://example.com/spot',
      image: 'photo_abc.jpg',
      preview_image: 'https://cdn/og.png',
      preview_title: 'The Spot',
      preview_description: 'Great tacos'
    }
  ];
  const [item] = shapeItinerary(items, [], names, avatars, null);
  assert.equal(item.url, 'https://example.com/spot');
  assert.equal(item.previewImage, 'https://cdn/og.png');
  assert.equal(item.previewTitle, 'The Spot');
  assert.equal(item.previewDescription, 'Great tacos');
  assert.equal(item.image, '/api/files/itinerary_items/i1/photo_abc.jpg?thumb=416x224');
});

test('media fields default to empty strings when absent (back-compat)', () => {
  const items = [{ id: 'i1', date: '', label: 'Legacy', sort_order: 0 }];
  const [item] = shapeItinerary(items, [], names, avatars, null);
  assert.equal(item.url, '');
  assert.equal(item.image, '');
  assert.equal(item.previewImage, '');
  assert.equal(item.previewTitle, '');
  assert.equal(item.previewDescription, '');
});
