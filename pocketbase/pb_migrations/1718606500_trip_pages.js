/// <reference path="../pb_data/types.d.ts" />

// Trip pages: arbitrary member-supplied HTML views attached to a trip — e.g. a
// Claude-artifact costume planner, a hand-made schedule, a game. The HTML is
// stored verbatim here but is NEVER rendered on the app origin's DOM: it is
// served members-only via /[share_token]/page/[id] with a
// `Content-Security-Policy: sandbox` header (opaque origin — no cookies, no
// same-origin API reach) and viewed through a sandboxed iframe. See
// $lib/server/pages.js for the exact header set.
//
// Superuser-only rules like every other trip child collection — the browser
// writes through the /[share_token]/actions op endpoint, never directly.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    const participants = app.findCollectionByNameOrId('participants');

    const pages = new Collection({
      type: 'base',
      name: 'trip_pages',
      fields: [
        {
          name: 'trip',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: trips.id,
          cascadeDelete: true
        },
        // Who added it (a participant). Scopes edit rights; not cascade-deleted so
        // a page survives its author leaving the trip.
        {
          name: 'added_by',
          type: 'relation',
          maxSelect: 1,
          collectionId: participants.id
        },
        { name: 'title', type: 'text', required: true, max: 120 },
        // The page itself. ~1.5 MB cap — a self-contained artifact with inlined
        // CSS/JS fits comfortably; anything bigger belongs on a real host.
        { name: 'html', type: 'text', max: 1500000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
      ],
      indexes: ['CREATE INDEX idx_trip_pages_trip ON trip_pages (trip)'],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null
    });
    app.save(pages);
  },
  (app) => {
    const pages = app.findCollectionByNameOrId('trip_pages');
    app.delete(pages);
  }
);
