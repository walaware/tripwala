/// <reference path="../pb_data/types.d.ts" />

// Dev seed: one fully-populated demo trip so the frontend renders end-to-end
// during the scaffold. Fixed share_token keeps the link stable across resets.
// Idempotent: skips if the demo trip already exists.

const DEMO_SHARE_TOKEN = "demo-rally-weekend";
const DEMO_OWNER_TOKEN = "owner-demo-rally-1234";

migrate(
  (app) => {
    try {
      app.findFirstRecordByData("trips", "share_token", DEMO_SHARE_TOKEN);
      return; // already seeded
    } catch (_) {
      // not found — proceed to seed
    }

    const record = (collectionName, data) => {
      const col = app.findCollectionByNameOrId(collectionName);
      const r = new Record(col);
      for (const k of Object.keys(data)) r.set(k, data[k]);
      app.save(r);
      return r;
    };

    const trip = record("trips", {
      name: "Mendocino Coast Camping",
      location: "Russian Gulch State Park, CA",
      start_date: "2026-07-17 00:00:00.000Z",
      end_date: "2026-07-19 00:00:00.000Z",
      description: "<p>Two nights of coastal redwoods, tide pools, and campfire chili. Bring layers — it gets cold at night.</p>",
      share_token: DEMO_SHARE_TOKEN,
      owner_token: DEMO_OWNER_TOKEN,
      expense_link: "https://spliit.app",
    });

    const sam = record("participants", {
      trip: trip.id,
      display_name: "Sam",
      client_id: "seed-client-sam",
      rsvp_status: "going",
    });
    const jenny = record("participants", {
      trip: trip.id,
      display_name: "Jenny",
      client_id: "seed-client-jenny",
      rsvp_status: "going",
    });
    record("participants", {
      trip: trip.id,
      display_name: "Marcus",
      client_id: "seed-client-marcus",
      rsvp_status: "maybe",
    });

    const tent = record("gear_items", {
      trip: trip.id,
      name: "4-person tent",
      category: "Shelter",
      qty_needed: 1,
      created_by: sam.id,
    });
    record("gear_items", {
      trip: trip.id,
      name: "Camp stove",
      category: "Cooking",
      qty_needed: 1,
      created_by: jenny.id,
    });
    record("gear_items", {
      trip: trip.id,
      name: "Headlamps",
      category: "Lighting",
      qty_needed: 4,
      created_by: sam.id,
    });

    record("gear_claims", {
      gear_item: tent.id,
      participant: sam.id,
      qty_claimed: 1,
    });

    const slots = [
      ["Fri Dinner", "2026-07-17 00:00:00.000Z", 0],
      ["Sat Breakfast", "2026-07-18 00:00:00.000Z", 1],
      ["Sat Dinner", "2026-07-18 00:00:00.000Z", 2],
      ["Sun Breakfast", "2026-07-19 00:00:00.000Z", 3],
    ];
    const friDinner = record("meal_slots", {
      trip: trip.id,
      label: slots[0][0],
      date: slots[0][1],
      sort_order: slots[0][2],
    });
    for (let i = 1; i < slots.length; i++) {
      record("meal_slots", {
        trip: trip.id,
        label: slots[i][0],
        date: slots[i][1],
        sort_order: slots[i][2],
      });
    }
    record("meal_signups", {
      meal_slot: friDinner.id,
      participant: jenny.id,
      dish_note: "Campfire chili + cornbread",
    });

    record("packing_items", {
      trip: trip.id,
      participant: sam.id,
      label: "Sleeping bag",
      is_shared: false,
      checked: true,
    });
    record("packing_items", {
      trip: trip.id,
      label: "First aid kit",
      is_shared: true,
      checked: false,
    });
  },
  (app) => {
    try {
      const trip = app.findFirstRecordByData(
        "trips",
        "share_token",
        DEMO_SHARE_TOKEN,
      );
      app.delete(trip); // cascades to related rows
    } catch (_) {
      // nothing seeded
    }
  },
);
