import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trailNameFromUrl, hostLabel, linkDisplayName } from './linkName.js';

test('trailNameFromUrl: AllTrails slug → title case', () => {
  assert.equal(
    trailNameFromUrl('https://www.alltrails.com/trail/us/california/big-pine-lakes-trail'),
    'Big Pine Lakes Trail'
  );
});

test('trailNameFromUrl: drops trailing numeric id and file extension', () => {
  assert.equal(trailNameFromUrl('https://example.com/trails/mount-baldy-loop-1024788'), 'Mount Baldy Loop');
  assert.equal(trailNameFromUrl('https://example.com/routes/sky-pilot.html'), 'Sky Pilot');
});

test('trailNameFromUrl: skips a bare id segment, uses the wordy one before it', () => {
  assert.equal(trailNameFromUrl('https://caltopo.com/m/john-muir-trail/4F2A'), 'John Muir Trail');
});

test('trailNameFromUrl: decodes percent-encoding', () => {
  assert.equal(trailNameFromUrl('https://example.com/trail/Half%20Dome'), 'Half Dome');
});

test('trailNameFromUrl: no wordy segment → empty', () => {
  assert.equal(trailNameFromUrl('https://caltopo.com/m/4F2A9'), '');
  assert.equal(trailNameFromUrl('https://example.com/'), '');
  assert.equal(trailNameFromUrl('not a url'), '');
});

test('hostLabel: strips www', () => {
  assert.equal(hostLabel('https://www.alltrails.com/trail/x'), 'alltrails.com');
  assert.equal(hostLabel('https://caltopo.com/m/ABC'), 'caltopo.com');
  assert.equal(hostLabel('garbage'), '');
});

test('linkDisplayName: OG title wins, else URL-derived, else host', () => {
  assert.equal(linkDisplayName('https://www.alltrails.com/trail/us/ca/x', 'Big Pine Lakes'), 'Big Pine Lakes');
  assert.equal(linkDisplayName('https://www.alltrails.com/trail/us/california/big-pine-lakes-trail'), 'Big Pine Lakes Trail');
  assert.equal(linkDisplayName('https://caltopo.com/m/4F2A9'), 'caltopo.com');
});
