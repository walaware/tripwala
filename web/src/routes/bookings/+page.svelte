<script>
  import { Card, EmptyState } from '@walaware/design';
  import { fmtDateRange } from '$lib/format.js';
  import { bookingTypeMeta, fmtMoney } from '$lib/bookings.js';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const pending = $derived(data.pending ?? []);
  const recoupable = $derived(data.recoupable ?? []);
  const today = $derived(data.today ?? '');

  /** Whole days from today until a YYYY-MM-DD deadline (negative = past). */
  function daysUntil(/** @type {string} */ deadline) {
    if (!deadline || !today) return null;
    const ms = Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
    return Math.round(ms / 86400000);
  }
  /** @param {number|null} d */
  function urgency(d) {
    if (d === null) return { label: 'no deadline', cls: 'bg-sand-200 text-cocoa-600' };
    if (d <= 0) return { label: 'today', cls: 'bg-berry-200 text-berry-700' };
    if (d <= 3) return { label: `${d}d left`, cls: 'bg-berry-200 text-berry-700' };
    if (d <= 14) return { label: `${d}d left`, cls: 'bg-amber-100 text-amber-700' };
    return { label: `${d}d left`, cls: 'bg-emerald-100 text-emerald-700' };
  }
</script>

<svelte:head><title>Bookings — tripwala</title></svelte:head>

<div>
  <div class="border-b border-sand-300 pb-4">
    <h1 class="font-display text-[27px] font-bold tracking-tight text-text-strong">Bookings 🎫</h1>
    <p class="mt-0.5 font-body text-[15px] font-bold text-text-muted">
      Across all your trips — what still needs booking, and what you can still cancel for a refund.
    </p>
  </div>

  {#if data.total === 0}
    <div class="mt-8">
      <EmptyState
        emoji="🎫"
        title="No bookings tracked yet"
        body="Add flights, stays & cars from a trip's Bookings section. They'll roll up here so you never lose track of what's pending or refundable."
      />
    </div>
  {:else}
    <!-- Still to book -->
    <section class="mt-6">
      <h2 class="mb-2 font-display text-[18px] font-bold text-text-strong">🕐 Still to book <span class="font-body text-[14px] font-extrabold text-text-muted">({pending.length})</span></h2>
      {#if pending.length === 0}
        <Card><p class="font-body text-[14px] font-bold text-text-muted">Nothing outstanding — everything's booked. 🎉</p></Card>
      {:else}
        <div class="flex flex-col gap-2">
          {#each pending as b (b.id)}
            {@const tm = bookingTypeMeta(b.type)}
            <a href="/{b.tripToken}#bookings" class="block">
              <Card class="transition hover:border-coral-300">
                <div class="flex items-center gap-2.5">
                  <span class="text-[16px]" aria-hidden="true">{tm.emoji}</span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-body text-[15px] font-extrabold text-cocoa-900">{b.title}</div>
                    <div class="font-body text-[12.5px] font-bold text-text-muted">
                      {b.tripName}{#if b.start_date} · {fmtDateRange(`${b.start_date}T00:00:00.000Z`, b.end_date ? `${b.end_date}T00:00:00.000Z` : '')}{/if}
                    </div>
                  </div>
                  {#if b.cost !== null}<span class="font-body text-[13px] font-extrabold text-cocoa-600">{fmtMoney(b.cost, b.currency)}</span>{/if}
                </div>
              </Card>
            </a>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Refundable — cancel windows -->
    <section class="mt-8">
      <h2 class="mb-2 font-display text-[18px] font-bold text-text-strong">↩ Can still recoup <span class="font-body text-[14px] font-extrabold text-text-muted">({recoupable.length})</span></h2>
      <p class="mb-2 font-body text-[13px] font-bold text-text-muted">Refundable bookings, soonest cancel deadline first.</p>
      {#if recoupable.length === 0}
        <Card><p class="font-body text-[14px] font-bold text-text-muted">No refundable bookings with an open cancel window.</p></Card>
      {:else}
        <div class="flex flex-col gap-2">
          {#each recoupable as b (b.id)}
            {@const tm = bookingTypeMeta(b.type)}
            {@const d = daysUntil(b.refund_deadline)}
            {@const u = urgency(d)}
            <a href="/{b.tripToken}#bookings" class="block">
              <Card class="transition hover:border-coral-300">
                <div class="flex items-center gap-2.5">
                  <span class="text-[16px]" aria-hidden="true">{tm.emoji}</span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-body text-[15px] font-extrabold text-cocoa-900">{b.title}</div>
                    <div class="font-body text-[12.5px] font-bold text-text-muted">
                      {b.tripName}{#if b.refund_deadline} · cancel by {fmtDateRange(`${b.refund_deadline}T00:00:00.000Z`, '')}{/if}
                    </div>
                  </div>
                  {#if b.cost !== null}<span class="font-body text-[13px] font-extrabold text-cocoa-600">{fmtMoney(b.cost, b.currency)}</span>{/if}
                  <span class="flex-none rounded-full px-2 py-0.5 font-body text-[11.5px] font-extrabold {u.cls}">{u.label}</span>
                </div>
              </Card>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
