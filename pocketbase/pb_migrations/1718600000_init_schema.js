/// <reference path="../pb_data/types.d.ts" />

// Rally MVP schema.
//
// Sharing model (see handoff doc): a trip is reached via a random `share_token`
// in the URL; the creator additionally holds an `owner_token`. There are no
// PocketBase user accounts for participants in the MVP — the token in the URL
// is the capability. API rules below are intentionally permissive for the
// scaffold so the seeded trip renders end-to-end; token-scoped rules are
// hardened in build-sequence step 9. The boundary is called out explicitly so
// it is not mistaken for "done".

migrate(
  (app) => {
    // ---- trips -----------------------------------------------------------
    const trips = new Collection({
      type: "base",
      name: "trips",
      fields: [
        { name: "name", type: "text", required: true, max: 200 },
        { name: "location", type: "text", max: 300 },
        { name: "start_date", type: "date" },
        { name: "end_date", type: "date" },
        { name: "description", type: "editor" },
        {
          name: "share_token",
          type: "text",
          required: true,
          min: 10,
          max: 64,
          pattern: "^[a-zA-Z0-9_-]+$",
        },
        {
          name: "owner_token",
          type: "text",
          required: true,
          min: 10,
          max: 64,
          pattern: "^[a-zA-Z0-9_-]+$",
        },
        { name: "expense_link", type: "url" },
        {
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
        },
        {
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_trips_share_token ON trips (share_token)",
        "CREATE UNIQUE INDEX idx_trips_owner_token ON trips (owner_token)",
      ],
      // Scaffold rules — see note above. Open read so the share link renders.
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: null, // admin only
    });
    app.save(trips);

    const tripRel = (extra) =>
      Object.assign(
        {
          name: "trip",
          type: "relation",
          required: true,
          collectionId: app.findCollectionByNameOrId("trips").id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        extra || {},
      );

    // ---- participants ----------------------------------------------------
    const participants = new Collection({
      type: "base",
      name: "participants",
      fields: [
        tripRel(),
        { name: "display_name", type: "text", required: true, max: 80 },
        // random uuid stored in localStorage for "this is me" re-association
        { name: "client_id", type: "text", required: true, max: 64 },
        {
          name: "rsvp_status",
          type: "select",
          maxSelect: 1,
          values: ["going", "maybe", "out"],
        },
        { name: "available_dates", type: "json", maxSize: 20000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE INDEX idx_participants_trip ON participants (trip)",
        "CREATE UNIQUE INDEX idx_participants_trip_client ON participants (trip, client_id)",
      ],
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    });
    app.save(participants);

    const participantRel = (extra) =>
      Object.assign(
        {
          name: "participant",
          type: "relation",
          collectionId: app.findCollectionByNameOrId("participants").id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        extra || {},
      );

    // ---- gear_items ------------------------------------------------------
    const gearItems = new Collection({
      type: "base",
      name: "gear_items",
      fields: [
        tripRel(),
        { name: "name", type: "text", required: true, max: 200 },
        { name: "category", type: "text", max: 80 },
        { name: "qty_needed", type: "number", min: 1, onlyInt: true },
        { name: "notes", type: "text", max: 500 },
        participantRel({ name: "created_by", required: false, cascadeDelete: false }),
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_gear_items_trip ON gear_items (trip)"],
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    });
    app.save(gearItems);

    // ---- gear_claims (separate table so an item can be split) ------------
    const gearClaims = new Collection({
      type: "base",
      name: "gear_claims",
      fields: [
        {
          name: "gear_item",
          type: "relation",
          required: true,
          collectionId: app.findCollectionByNameOrId("gear_items").id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        participantRel({ required: true, cascadeDelete: true }),
        { name: "qty_claimed", type: "number", min: 1, onlyInt: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_gear_claims_item ON gear_claims (gear_item)"],
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    });
    app.save(gearClaims);

    // ---- meal_slots ------------------------------------------------------
    const mealSlots = new Collection({
      type: "base",
      name: "meal_slots",
      fields: [
        tripRel(),
        { name: "label", type: "text", required: true, max: 80 },
        { name: "date", type: "date" },
        { name: "sort_order", type: "number", onlyInt: true },
      ],
      indexes: ["CREATE INDEX idx_meal_slots_trip ON meal_slots (trip)"],
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    });
    app.save(mealSlots);

    // ---- meal_signups ----------------------------------------------------
    const mealSignups = new Collection({
      type: "base",
      name: "meal_signups",
      fields: [
        {
          name: "meal_slot",
          type: "relation",
          required: true,
          collectionId: app.findCollectionByNameOrId("meal_slots").id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        participantRel({ required: true, cascadeDelete: true }),
        { name: "dish_note", type: "text", max: 300 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_meal_signups_slot ON meal_signups (meal_slot)"],
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    });
    app.save(mealSignups);

    // ---- packing_items ---------------------------------------------------
    // participant is nullable: null + is_shared => a shared group item.
    const packingItems = new Collection({
      type: "base",
      name: "packing_items",
      fields: [
        tripRel(),
        participantRel({ required: false, cascadeDelete: true }),
        { name: "label", type: "text", required: true, max: 200 },
        { name: "is_shared", type: "bool" },
        { name: "checked", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_packing_items_trip ON packing_items (trip)"],
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    });
    app.save(packingItems);
  },
  (app) => {
    // Down: drop in reverse dependency order.
    const names = [
      "packing_items",
      "meal_signups",
      "meal_slots",
      "gear_claims",
      "gear_items",
      "participants",
      "trips",
    ];
    for (const n of names) {
      try {
        app.delete(app.findCollectionByNameOrId(n));
      } catch (_) {
        // already gone
      }
    }
  },
);
