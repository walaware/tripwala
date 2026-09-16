<script>
  // "Check card benefits" panel for a stay booking (moneywala charter step 7):
  // given dates + channel + paying card (+ an optionally pasted cash quote),
  // asks the server to run moneywala's deterministic evaluate-booking and shows
  // what fires, what conflicts, and what it really costs. The browser only ever
  // talks to our own /[share_token]/benefits endpoint — the moneywala token
  // stays server-side. If moneywala is unreachable this degrades to a soft note.
  import { onMount } from 'svelte';
  import { Button } from '@walaware/design';
  import { fmtCents, failedGates } from '$lib/benefits.js';

  /**
   * @type {{
   *   shareToken: string,
   *   booking: { start_date: string, end_date: string, cost: number|null, currency: string }
   * }}
   */
  let { shareToken, booking } = $props();

  /** 'loading' → 'ready' | 'unavailable' (moneywala down) | 'off' (not configured) */
  let phase = $state('loading');
  /** @type {Array<{ id: string, product: string, holder: string, available: number }>} */
  let cards = $state([]);
  /**
   * Channel values live rules gate on, verbatim from moneywala's discovery
   * endpoint — household data, not an enum, so never hardcoded here. '' means
   * "direct / somewhere no credit cares about" (passes only open-channel rules).
   * @type {string[]}
   */
  let channels = $state([]);

  // The form. Dates prefill ONCE from the booking (the panel is opened per
  // booking); the quote prefills from its cost when that looks like USD
  // (moneywala's math is USD cents).
  // svelte-ignore state_referenced_locally
  const usdish = !booking.currency || /^(usd|us\$|\$)$/i.test(booking.currency.trim());
  // svelte-ignore state_referenced_locally
  let checkIn = $state(booking.start_date || '');
  // svelte-ignore state_referenced_locally
  let checkOut = $state(booking.end_date || '');
  let cardId = $state('');
  let channel = $state('');
  let prepaid = $state(false);
  // svelte-ignore state_referenced_locally
  let quote = $state(usdish && booking.cost !== null ? String(booking.cost) : '');

  let evaluating = $state(false);
  let evalError = $state('');
  /** @type {any} shaped evaluation from the server, null until a run */
  let ev = $state(null);
  let showBlocked = $state(false);

  // svelte-ignore state_referenced_locally
  const endpoint = `/${encodeURIComponent(shareToken)}/benefits`;

  onMount(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.configured) {
        phase = 'off';
        return;
      }
      cards = data.cards ?? [];
      channels = data.channels ?? [];
      cardId = cards[0]?.id ?? '';
      phase = 'ready';
    } catch (_) {
      phase = 'unavailable';
    }
  });

  async function evaluate() {
    if (evaluating) return;
    evaluating = true;
    evalError = '';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          check_in: checkIn,
          check_out: checkOut,
          paying_card_id: cardId,
          channel,
          prepaid,
          cash_quote: quote
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Benefits check failed (${res.status})`);
      ev = data.evaluation;
      showBlocked = false;
    } catch (/** @type {any} */ e) {
      evalError = e?.message || 'Benefits check failed';
    } finally {
      evaluating = false;
    }
  }

  const ready = $derived(!!checkIn && !!checkOut && !!cardId);

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
  const labelClass = 'mb-0.5 block font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400';
  const softNote = 'rounded-lg border-2 border-sand-200 bg-sand-100 px-3 py-2 font-body text-[12.5px] font-bold text-cocoa-500';

  /** @param {any} c credit row line: "$300 · CSR $300 Annual Travel Credit — Chase Sapphire Reserve (Sam)" */
  const creditWho = (c) => `${c.cardProduct}${c.holder ? ` (${c.holder})` : ''}`;
</script>

{#if phase === 'loading'}
  <p class={softNote}>💳 Checking the household's cards…</p>
{:else if phase === 'unavailable'}
  <p class={softNote}>💳 moneywala isn’t reachable right now — benefits check will be back.</p>
{:else if phase === 'off'}
  <p class={softNote}>💳 Benefits check isn’t set up on this instance.</p>
{:else}
  <div class="flex flex-col gap-2 rounded-lg border-2 border-sand-200 bg-sand-100 p-3">
    <div class="flex flex-col gap-2 sm:flex-row">
      <div>
        <label class={labelClass} for="bn-in">Check-in</label>
        <input id="bn-in" type="date" bind:value={checkIn} class={inputClass} />
      </div>
      <div>
        <label class={labelClass} for="bn-out">Check-out</label>
        <input id="bn-out" type="date" bind:value={checkOut} min={checkIn} class={inputClass} />
      </div>
      <div class="flex-1">
        <label class={labelClass} for="bn-card">Paying card</label>
        <select id="bn-card" bind:value={cardId} class={inputClass}>
          {#each cards as c (c.id)}
            <option value={c.id}>{c.product} ({c.holder}){c.available ? ` · ${c.available} live benefit${c.available === 1 ? '' : 's'}` : ''}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row">
      <div class="flex-1">
        <label class={labelClass} for="bn-channel">Booked via</label>
        <select id="bn-channel" bind:value={channel} class={inputClass}>
          <option value="">Direct / somewhere else</option>
          {#each channels as ch (ch)}
            <option value={ch}>{ch}</option>
          {/each}
        </select>
      </div>
      <div class="sm:w-32">
        <label class={labelClass} for="bn-quote">Cash quote $</label>
        <input id="bn-quote" inputmode="decimal" bind:value={quote} placeholder="optional" class={inputClass} />
      </div>
      <label class="flex items-end gap-1.5 pb-2 font-body text-[12.5px] font-bold text-cocoa-600">
        <input type="checkbox" bind:checked={prepaid} class="h-4 w-4 accent-coral-500" />
        Prepaid
      </label>
    </div>

    <div class="flex items-center gap-2">
      <Button variant="soft" size="sm" onclick={evaluate} disabled={evaluating || !ready}>
        {evaluating ? 'Checking…' : 'What fires?'}
      </Button>
      {#if evalError}
        <span class="font-body text-[12.5px] font-bold text-berry-600">{evalError}</span>
      {/if}
    </div>

    {#if ev}
      <div class="flex flex-col gap-2 border-t-2 border-sand-200 pt-2">
        {#if ev.statement.length || ev.onProperty.length}
          <p class="font-body text-[13.5px] font-extrabold text-emerald-700">
            ✅ {fmtCents(ev.totalValueCents)} in credits should fire on this stay
          </p>
          {#each [...ev.statement, ...ev.onProperty] as c (c.id)}
            <p class="font-body text-[12.5px] font-bold text-cocoa-700">
              <span class="text-emerald-700">{fmtCents(c.amountCents, c.currency)}</span>
              {c.creditType === 'on_property' ? ' on-property' : ' statement'} · {c.ruleName}
              <span class="text-cocoa-400">— {creditWho(c)}</span>
            </p>
          {/each}
        {:else}
          <p class="font-body text-[13.5px] font-extrabold text-cocoa-600">😕 No credits fire for this setup</p>
        {/if}

        {#if ev.conflicts.length}
          <div class="rounded-md bg-amber-50 px-2.5 py-1.5">
            <p class="font-body text-[12.5px] font-extrabold text-amber-700">⚠️ Would fire if a different card paid:</p>
            {#each ev.conflicts as c (c.id)}
              <p class="font-body text-[12.5px] font-bold text-amber-700">
                {fmtCents(c.amountCents, c.currency)} · {c.ruleName} <span class="opacity-70">— pay with {creditWho(c)}</span>
              </p>
            {/each}
          </div>
        {/if}

        {#if ev.fees.length}
          {#each ev.fees as f (f.label)}
            <p class="font-body text-[12px] font-bold text-cocoa-500">
              💳 {f.label}: {fmtCents(f.annualFeeCents, f.currency)}/yr annual fee{f.renewsOn ? `, renews ${f.renewsOn}` : ''}{f.renewalInDays !== null ? ` (${f.renewalInDays}d)` : ''}
            </p>
          {/each}
        {/if}

        {#if ev.pricing.length}
          <div class="flex flex-col gap-0.5">
            {#each ev.pricing as p (p.kind + p.label)}
              <p class="font-body text-[12.5px] font-bold {p.cheapest ? 'text-emerald-700' : 'text-cocoa-600'}">
                {p.cheapest ? '🏆 ' : ''}{p.label}: {fmtCents(p.equivalentCents)}
                {#if p.note}<span class="font-semibold text-cocoa-400"> · {p.note}</span>{/if}
              </p>
            {/each}
          </div>
        {/if}

        {#if ev.blocked.length}
          <button
            type="button"
            onclick={() => (showBlocked = !showBlocked)}
            class="self-start font-body text-[12px] font-extrabold text-cocoa-400 hover:text-coral-600"
          >{showBlocked ? '▾' : '▸'} Why not the other {ev.blocked.length}?</button>
          {#if showBlocked}
            {#each ev.blocked as c (c.id)}
              <p class="font-body text-[12px] font-semibold text-cocoa-500">
                {fmtCents(c.amountCents, c.currency)} · {c.ruleName} —
                {failedGates(c).map((/** @type {any} */ g) => g.detail).join('; ')}
              </p>
            {/each}
          {/if}
        {/if}

        <p class="font-body text-[11px] font-semibold text-cocoa-400">
          Deterministic check by moneywala · quotes are pasted, never scraped · reserve &amp; confirm in moneywala
        </p>
      </div>
    {/if}
  </div>
{/if}
