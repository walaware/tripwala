<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Button, EmptyState } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { fmtDateRange } from '$lib/format.js';
  import { bookingTypeMeta, statusMeta, refundMeta, fmtMoney } from '$lib/bookings.js';

  /**
   * @typedef {{ id: string, type: string, title: string, status: string, refundable: string, refund_deadline: string, start_date: string, end_date: string, cost: number|null, currency: string, confirmation: string, link: string, notes: string, addedBy: string|null }} Booking
   */

  /**
   * @type {{
   *   shareToken: string,
   *   bookings: Booking[],
   *   currentParticipantId: string | null,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { shareToken, bookings, currentParticipantId, ownerMode = false, onHide = null, collapsed = false, onToggle = null } = $props();

  const canManage = (/** @type {Booking} */ b) => ownerMode || (!!currentParticipantId && b.addedBy === currentParticipantId);
  const total = $derived(bookings.length);

  let busy = $state(false);
  /** @param {Record<string, unknown>} body */
  async function run(body) {
    if (busy) return;
    busy = true;
    try {
      await tripAction(shareToken, body);
      await invalidateAll();
    } catch (_) {
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  // One add/edit form open at a time. editId '' = closed; 'new' = adding.
  let editId = $state('');
  /** @type {any} */
  let f = $state(blank());
  function blank() {
    return { type: 'flight', title: '', status: 'planning', refundable: 'unknown', refund_deadline: '', start_date: '', end_date: '', cost: '', currency: '', confirmation: '', link: '', notes: '' };
  }
  function openAdd() {
    editId = 'new';
    f = blank();
  }
  /** @param {Booking} b */
  function openEdit(b) {
    editId = b.id;
    f = { ...b, cost: b.cost ?? '' };
  }
  function close() {
    editId = '';
  }
  async function submit() {
    if (!f.title.trim()) return;
    const payload = {
      type: f.type,
      title: f.title.trim(),
      status: f.status,
      refundable: f.refundable,
      refund_deadline: f.refund_deadline,
      start_date: f.start_date,
      end_date: f.end_date,
      cost: f.cost,
      currency: f.currency,
      confirmation: f.confirmation,
      link: f.link,
      notes: f.notes
    };
    if (editId === 'new') await run({ op: 'booking_add', ...payload });
    else await run({ op: 'booking_update', bookingId: editId, ...payload });
    close();
  }
  /** @param {string} bookingId */
  const remove = (bookingId) => run({ op: 'booking_remove', bookingId });

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
  const labelClass = 'mb-0.5 block font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400';
</script>

<SectionHeader emoji="🎫" title="Bookings" subtitle={total ? `${total} tracked` : ''} {onHide} {collapsed} {onToggle} />
<Card>
  {#if !total && editId !== 'new'}
    <EmptyState
      emoji="🎫"
      title="No bookings yet"
      body="Track flights, stays & cars — mark each planning · booked · confirmed, and whether it's refundable so you know what you can still cancel."
    />
  {/if}

  <div class="flex flex-col gap-2">
    {#each bookings as b (b.id)}
      {#if editId === b.id}
        {@render form()}
      {:else}
        {@render row(b)}
      {/if}
    {/each}
  </div>

  {#if editId === 'new'}
    <div class="mt-2">{@render form()}</div>
  {:else if currentParticipantId}
    <button
      type="button"
      onclick={openAdd}
      class="mt-3 self-start rounded-full px-2.5 py-1 font-body text-[13px] font-extrabold text-coral-600 transition hover:bg-coral-100"
    >＋ Add a booking</button>
  {/if}
</Card>

{#snippet row(/** @type {Booking} */ b)}
  {@const tm = bookingTypeMeta(b.type)}
  {@const sm = statusMeta(b.status)}
  {@const rm = refundMeta(b.refundable)}
  <div class="group flex flex-col gap-1 rounded-lg border-2 border-sand-200 bg-white px-3 py-2.5">
    <div class="flex items-center gap-2">
      <span class="flex-none text-[15px]" aria-hidden="true">{tm.emoji}</span>
      <span class="min-w-0 flex-1 truncate font-body text-[14.5px] font-extrabold text-cocoa-900">{b.title}</span>
      <span class="flex-none rounded-full px-2 py-0.5 font-body text-[11.5px] font-extrabold {sm.cls}">{sm.label}</span>
      {#if canManage(b)}
        <span class="flex flex-none items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button type="button" aria-label="Edit" onclick={() => openEdit(b)} class="px-1.5 font-body text-[12px] font-bold text-cocoa-400 hover:text-coral-600">Edit</button>
          <button type="button" aria-label="Remove" onclick={() => remove(b.id)} disabled={busy} class="px-1.5 font-body text-[12px] font-bold text-cocoa-400 hover:text-berry-600">✕</button>
        </span>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-body text-[12.5px] font-bold text-cocoa-500">
      {#if b.start_date}
        <span>🗓️ {fmtDateRange(`${b.start_date}T00:00:00.000Z`, b.end_date ? `${b.end_date}T00:00:00.000Z` : '')}</span>
      {/if}
      {#if b.cost !== null}<span>💰 {fmtMoney(b.cost, b.currency)}</span>{/if}
      <span class={rm.cls}>{rm.emoji} {rm.label}</span>
      {#if b.refundable === 'refundable' && b.refund_deadline}
        <span class="text-amber-700">↩ cancel by {fmtDateRange(`${b.refund_deadline}T00:00:00.000Z`, '')}</span>
      {/if}
      {#if b.confirmation}<span>#{b.confirmation}</span>{/if}
      {#if b.link}<a href={b.link} target="_blank" rel="noopener noreferrer" class="text-coral-600 hover:underline">open ↗</a>{/if}
    </div>

    {#if b.notes}
      <p class="whitespace-pre-line font-body text-[12.5px] font-semibold leading-snug text-cocoa-600">{b.notes}</p>
    {/if}
  </div>
{/snippet}

{#snippet form()}
  <div class="flex flex-col gap-2 rounded-lg border-2 border-coral-200 bg-sand-100 p-3">
    <div class="flex flex-col gap-2 sm:flex-row">
      <div class="sm:w-32">
        <label class={labelClass} for="bk-type">Type</label>
        <select id="bk-type" bind:value={f.type} class={inputClass}>
          <option value="flight">✈️ Flight</option>
          <option value="stay">🏨 Stay</option>
          <option value="car">🚗 Car</option>
          <option value="other">🎫 Other</option>
        </select>
      </div>
      <div class="flex-1">
        <label class={labelClass} for="bk-title">Title</label>
        <input id="bk-title" bind:value={f.title} placeholder="SFO → NRT · UA837" maxlength="200" class={inputClass} onkeydown={(e) => e.key === 'Enter' && submit()} />
      </div>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row">
      <div class="flex-1">
        <label class={labelClass} for="bk-status">Status</label>
        <select id="bk-status" bind:value={f.status} class={inputClass}>
          <option value="planning">🕐 Planning</option>
          <option value="booked">✅ Booked</option>
          <option value="confirmed">🔒 Confirmed</option>
        </select>
      </div>
      <div class="flex-1">
        <label class={labelClass} for="bk-refund">Refundable?</label>
        <select id="bk-refund" bind:value={f.refundable} class={inputClass}>
          <option value="unknown">❔ Unknown</option>
          <option value="refundable">↩ Refundable</option>
          <option value="nonrefundable">🚫 Non-refundable</option>
        </select>
      </div>
      {#if f.refundable === 'refundable'}
        <div>
          <label class={labelClass} for="bk-deadline">Cancel by</label>
          <input id="bk-deadline" type="date" bind:value={f.refund_deadline} class={inputClass} />
        </div>
      {/if}
    </div>

    <div class="flex flex-col gap-2 sm:flex-row">
      <div>
        <label class={labelClass} for="bk-start">Start</label>
        <input id="bk-start" type="date" bind:value={f.start_date} class={inputClass} />
      </div>
      <div>
        <label class={labelClass} for="bk-end">End</label>
        <input id="bk-end" type="date" bind:value={f.end_date} min={f.start_date} class={inputClass} />
      </div>
      <div class="sm:w-28">
        <label class={labelClass} for="bk-cost">Cost</label>
        <input id="bk-cost" type="number" min="0" step="0.01" bind:value={f.cost} placeholder="0" class={inputClass} />
      </div>
      <div class="sm:w-20">
        <label class={labelClass} for="bk-cur">Currency</label>
        <input id="bk-cur" bind:value={f.currency} placeholder="USD" maxlength="8" class={inputClass} />
      </div>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row">
      <div class="sm:w-40">
        <label class={labelClass} for="bk-conf">Confirmation #</label>
        <input id="bk-conf" bind:value={f.confirmation} maxlength="120" class={inputClass} />
      </div>
      <div class="flex-1">
        <label class={labelClass} for="bk-link">Link</label>
        <input id="bk-link" inputmode="url" bind:value={f.link} placeholder="https://…" class={inputClass} />
      </div>
    </div>

    <div>
      <label class={labelClass} for="bk-notes">Notes</label>
      <textarea id="bk-notes" bind:value={f.notes} rows="2" maxlength="1000" class="resize-y {inputClass}"></textarea>
    </div>

    <div class="flex justify-end gap-2">
      <Button variant="soft" size="sm" onclick={submit} disabled={busy || !f.title.trim()}>{editId === 'new' ? 'Add' : 'Save'}</Button>
      <Button variant="ghost" size="sm" onclick={close} disabled={busy}>Cancel</Button>
    </div>
  </div>
{/snippet}
