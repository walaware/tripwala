/// <reference path="../pb_data/types.d.ts" />

// Booking tracker (#4): flights, stays, cars and other reservations attached to
// a trip, each with a booking status (planning → booked → confirmed) and a
// refundability record (refundable? until when?). This is what powers the
// cross-trip reminders: "what's still un-booked?" (status = planning) and "what
// can I still get my money back on if I cancel?" (refundable + a future
// refund deadline).
//
// Superuser-only rules like every other trip child collection — the browser
// writes through the /[share_token]/actions op endpoint, never directly.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    const participants = app.findCollectionByNameOrId('participants');

    const bookings = new Collection({
      type: 'base',
      name: 'bookings',
      fields: [
        {
          name: 'trip',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: trips.id,
          cascadeDelete: true
        },
        // Who added it (a participant of the trip). Used to scope edit rights and
        // to attribute a booking on the cross-trip view. Not cascade-deleted: if a
        // participant leaves, their booking stays on the trip.
        {
          name: 'added_by',
          type: 'relation',
          maxSelect: 1,
          collectionId: participants.id
        },
        { name: 'type', type: 'select', maxSelect: 1, values: ['flight', 'stay', 'car', 'other'] },
        { name: 'title', type: 'text', required: true, max: 200 },
        { name: 'status', type: 'select', maxSelect: 1, values: ['planning', 'booked', 'confirmed'] },
        { name: 'refundable', type: 'select', maxSelect: 1, values: ['unknown', 'refundable', 'nonrefundable'] },
        // Last day you can cancel/change and still recoup money. Drives reminders.
        { name: 'refund_deadline', type: 'date' },
        // The reservation's own dates: flight departure / stay check-in → check-out.
        { name: 'start_date', type: 'date' },
        { name: 'end_date', type: 'date' },
        { name: 'cost', type: 'number' },
        { name: 'currency', type: 'text', max: 8 },
        { name: 'confirmation', type: 'text', max: 120 },
        { name: 'link', type: 'url' },
        { name: 'notes', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
      ],
      indexes: [
        'CREATE INDEX idx_bookings_trip ON bookings (trip)',
        'CREATE INDEX idx_bookings_added_by ON bookings (added_by)'
      ],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null
    });
    app.save(bookings);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('bookings'));
  }
);
