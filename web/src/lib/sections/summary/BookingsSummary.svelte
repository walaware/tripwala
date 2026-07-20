<script>
  import { Chip } from '@walaware/design';
  import { fmtDateRange } from '$lib/format.js';

  /** @type {{ bookings: Array<any>, onOpen: () => void }} */
  let { bookings, onOpen } = $props();

  /** @type {Record<string, string>} */
  const EMOJI = { flight: '✈️', stay: '🏠', car: '🚗', other: '🎫' };
  /** @param {string} status @returns {{ label: string, tone: 'leaf' | 'sun' }} */
  function chip(status) {
    if (status === 'confirmed') return { label: 'Confirmed', tone: 'leaf' };
    if (status === 'booked') return { label: 'Booked', tone: 'leaf' };
    return { label: 'Planning', tone: 'sun' };
  }
  const rows = $derived(bookings.slice(0, 3));
  const more = $derived(Math.max(0, bookings.length - rows.length));
  const linkClass = 'mt-3 block font-body text-[13px] font-extrabold text-coral-600 hover:underline';
</script>

{#if bookings.length}
  <div class="flex flex-col">
    {#each rows as b, i (b.id)}
      {@const c = chip(b.status)}
      <div class="flex items-center gap-2.5 py-2 {i === 0 ? '' : 'border-t border-sand-200'}">
        <span class="w-6 flex-none text-center text-[17px]">{EMOJI[b.type] ?? '🎫'}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate font-body text-[14px] font-extrabold text-text-strong">{b.title || 'Untitled'}</div>
          {#if b.start_date}<div class="font-body text-[12px] font-bold text-text-muted">{fmtDateRange(b.start_date, b.end_date || b.start_date)}</div>{/if}
        </div>
        <Chip tone={c.tone}>{c.label}</Chip>
      </div>
    {/each}
  </div>
  <button type="button" class={linkClass} onclick={onOpen}>
    {more ? `See all ${bookings.length} bookings →` : '＋ Add a booking'}
  </button>
{:else}
  <p class="py-1 font-body text-[13px] font-bold text-text-muted">Nothing booked yet.</p>
  <button type="button" class={linkClass} onclick={onOpen}>＋ Add a booking</button>
{/if}
