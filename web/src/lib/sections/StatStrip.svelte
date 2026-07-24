<script>
  import { tripLength } from '$lib/format.js';

  /**
   * The dashboard's one-row Overview stat strip: Countdown · Crew · Next up · To
   * decide (a primary-soft button that jumps to the itinerary's decisions block).
   * Replaces the old three-tile Overview section.
   *
   * @type {{
   *   trip: any,
   *   participants: Array<any>,
   *   itineraryItems: Array<any>,
   *   onDecide: () => void
   * }}
   */
  let { trip, participants, itineraryItems, onDecide } = $props();

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);
  const maybe = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'maybe').length);
  // Open decisions = the undated "To decide" QUESTIONS ("Where to camp?"), not
  // their options — one question is one open decision no matter how many options
  // sit under it (matches the itinerary's top decisions block). Legacy ungrouped
  // decisions (flexible, no question) still count so a pre-grouping trip reads right.
  const decisions = $derived(
    itineraryItems.filter((/** @type {any} */ i) => !i.date && (i.kind === 'question' || (i.kind === 'flexible' && !i.group))).length
  );

  // Live countdown (UTC-day granularity), ticking each minute so it rolls over.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(id);
  });
  const countdown = $derived.by(() => {
    if (trip.status === 'completed' || trip.status === 'past') return 'Wrapped';
    if (!trip.start_date) return 'TBD';
    const n = new Date(now);
    const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const s = new Date(trip.start_date);
    const start = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    const days = Math.round((start - today) / 86400000);
    if (days > 1) return `In ${days} days`;
    if (days === 1) return 'Tomorrow';
    if (days === 0) return 'Today!';
    return -days < tripLength(trip.start_date, trip.end_date).days ? 'Now' : 'Wrapped';
  });

  // Next up = the next dated itinerary entry from today forward (items arrive
  // date-sorted). Falls back to the earliest entry, then to a gentle nudge.
  const todayIso = $derived(new Date(now).toISOString().slice(0, 10));
  const nextUp = $derived.by(() => {
    const dated = itineraryItems.filter((/** @type {any} */ i) => i.date);
    const upcoming = dated.find((/** @type {any} */ i) => i.date >= todayIso) ?? dated[0];
    if (!upcoming) return 'Nothing scheduled yet';
    return upcoming.time ? `${upcoming.label} · ${upcoming.time}` : upcoming.label;
  });
</script>

<div class="stat-strip">
  <div class="stat">
    <div class="stat-label">Countdown</div>
    <div class="stat-value">{countdown}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Crew</div>
    <div class="stat-value">{going} going{#if maybe} · {maybe} maybe{/if}</div>
  </div>
  <div class="stat" style="flex: 1.5">
    <div class="stat-label">Next up</div>
    <div class="stat-value truncate">{nextUp}</div>
  </div>
  <button type="button" class="stat stat-decide" onclick={onDecide}>
    <div class="stat-label">To decide</div>
    <div class="stat-value">{decisions ? `${decisions} open` : 'All decided'}</div>
  </button>
</div>

<style>
  .stat-strip {
    display: flex;
    gap: 12px;
    margin-bottom: var(--stack-gap, 14px);
  }
  .stat {
    flex: 1;
    min-width: 0;
    border-radius: var(--radius-md, 10px);
    background: var(--color-surface-sunk);
    padding: 12px 14px;
    text-align: left;
  }
  .stat-decide {
    background: var(--color-primary-soft);
    cursor: pointer;
    transition: filter 0.15s;
  }
  .stat-decide:hover {
    filter: brightness(0.98);
  }
  .stat-label {
    font-family: var(--font-body);
    font-size: 10.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }
  .stat-decide .stat-label {
    color: var(--color-primary-press, var(--color-coral-700));
  }
  .stat-value {
    margin-top: 2px;
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text-strong);
  }
  .stat-decide .stat-value {
    color: var(--color-primary-press, var(--color-coral-700));
  }
  @media (max-width: 640px) {
    .stat-strip {
      flex-wrap: wrap;
    }
    .stat {
      flex: 1 1 calc(50% - 6px);
    }
  }
</style>
